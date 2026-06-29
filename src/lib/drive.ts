// Integração com o Google Drive central (server-only, Decisão #009/#011).
// Usa o refresh token da conta central. Escopo drive.file: só enxerga o que o app cria.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const ROOT_FOLDER_NAME = "Gravador"; // pasta-mãe do projeto
const FOLDER_MIME = "application/vnd.google-apps.folder";

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DRIVE_CLIENT_ID!,
      client_secret: process.env.DRIVE_CLIENT_SECRET!,
      refresh_token: process.env.DRIVE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Drive token ${res.status}`);
  return (await res.json()).access_token as string;
}

async function findFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string | null> {
  const safe = name.replace(/['\\]/g, "\\$&");
  let q = `name='${safe}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await fetch(
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive find ${res.status}`);
  return ((await res.json()).files?.[0]?.id as string) ?? null;
}

async function createFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  const meta: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) meta.parents = [parentId];
  const res = await fetch(`${DRIVE}/files?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error(`Drive mkdir ${res.status}`);
  return (await res.json()).id as string;
}

async function ensureFolder(
  token: string,
  name: string,
  parentId?: string
): Promise<string> {
  return (await findFolder(token, name, parentId)) ?? createFolder(token, name, parentId);
}

// Resolve (cria/acha) a pasta do usuário aninhada por workspace (DEC-009):
//   Gravador / "<nome-workspace>_<uuid-ws>" / "<nome+sobrenome>_<uuid-user>".
// O uuid no nome resolve colisões de nome. Reusa um único access token.
async function resolveUserFolderId(
  token: string,
  workspace: { id: string; name: string },
  user: { id: string; label: string }
): Promise<{ userFolderId: string; workspaceFolderId: string }> {
  const root = await ensureFolder(token, ROOT_FOLDER_NAME);
  const workspaceFolderId = await ensureFolder(token, `${workspace.name}_${workspace.id}`, root);
  const userFolderId = await ensureFolder(token, `${user.label}_${user.id}`, workspaceFolderId);
  return { userFolderId, workspaceFolderId };
}

// Abre uma SESSÃO de upload resumível e devolve só a session URI. O browser faz o PUT dos bytes
// DIRETO no Google (o áudio NÃO passa pelo servidor → contorna o cap ~4.5MB da função na Vercel);
// o refresh token/segredo nunca vai ao cliente. O header `Origin` é o que faz o Google liberar CORS
// no PUT cross-origin do browser (validado em spike, 2026-06-29). Cria a pasta de destino (DEC-009)
// na hora. REQ-006. Ver tutoriais/drive-api-setup.md (§Segredos).
export async function createResumableSession(opts: {
  workspace: { id: string; name: string };
  user: { id: string; label: string };
  filename: string;
  mimeType: string;
  origin: string; // origem da app (a mesma de onde o browser dará o PUT)
}): Promise<{ sessionUrl: string; folderId: string }> {
  const token = await getAccessToken();
  const { userFolderId } = await resolveUserFolderId(token, opts.workspace, opts.user);
  const meta = JSON.stringify({ name: opts.filename, parents: [userFolderId] });
  const res = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
      Origin: opts.origin,
    },
    body: meta,
  });
  if (!res.ok) throw new Error(`Drive resumable init ${res.status}: ${await res.text()}`);
  const sessionUrl = res.headers.get("location");
  if (!sessionUrl) throw new Error("Drive resumable init: sem header Location");
  return { sessionUrl, folderId: userFolderId };
}

// No finalize, confere que o arquivo que o browser subiu existe e está DENTRO da pasta do próprio
// usuário (impede o cliente forjar um fileId de outra gravação). Devolve a pasta esperada (p/ gravar
// no DB). Reusa um único token. Escopo drive.file: só enxerga o que o app criou.
export async function verifyDriveFileInUserFolder(opts: {
  fileId: string;
  workspace: { id: string; name: string };
  user: { id: string; label: string };
}): Promise<{ ok: boolean; folderId: string }> {
  const token = await getAccessToken();
  const { userFolderId } = await resolveUserFolderId(token, opts.workspace, opts.user);
  const res = await fetch(
    `${DRIVE}/files/${encodeURIComponent(opts.fileId)}?fields=id,parents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return { ok: false, folderId: userFolderId };
  if (!res.ok) throw new Error(`Drive meta ${res.status}`);
  const meta = (await res.json()) as { parents?: string[] };
  const ok = Array.isArray(meta.parents) && meta.parents.includes(userFolderId);
  return { ok, folderId: userFolderId };
}

// Sobe o avatar do usuário para Gravador / Avatares / "<label>_<profileId>" (DEC-009, foto do Google).
// Best-effort: o caller (auth jwt) só chama no 1º login e engole erros — falhar aqui não quebra o login,
// só deixa o avatar nulo (cai no fallback de inicial). Retorna o fileId, servido por /api/avatar/[id].
export async function uploadAvatar(opts: {
  profileId: string;
  label: string;
  ext: string;
  mimeType: string;
  data: Uint8Array | ArrayBuffer;
}): Promise<string> {
  const token = await getAccessToken();
  const root = await ensureFolder(token, ROOT_FOLDER_NAME);
  const avatarsFolder = await ensureFolder(token, "Avatares", root);

  const safeLabel = opts.label.replace(/[/\\]/g, "_");
  const boundary = "avatar" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({
    name: `${safeLabel}_${opts.profileId}.${opts.ext}`,
    parents: [avatarsFolder],
  });
  const pre =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${meta}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`;
  const post = `\r\n--${boundary}--`;
  const body = new Blob([pre, opts.data as BlobPart, post], {
    type: `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive avatar upload ${res.status}: ${await res.text()}`);
  return (await res.json()).id as string;
}

// Baixa (stream) o conteúdo de um arquivo do Drive (alt=media) para o player do detalhe (Fatia D2).
// Repassa o header Range (se houver) para permitir seek no <audio>; devolve a Response crua do Drive
// (o caller faz o passthrough de status/headers/body). Escopo drive.file: só lê o que o app criou.
export async function fetchDriveMedia(fileId: string, range?: string | null): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers.Range = range;
  return fetch(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media`, { headers });
}

// Helpers de teste/admin.
export async function listFolder(
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const token = await getAccessToken();
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await fetch(
    `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return ((await res.json()).files as { id: string; name: string }[]) ?? [];
}

export async function deleteDriveItem(id: string): Promise<void> {
  const token = await getAccessToken();
  await fetch(`${DRIVE}/files/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
