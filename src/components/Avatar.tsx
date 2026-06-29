// Avatar do usuário. Se houver `avatarUrl` (foto do Google, servida do Drive por /api/avatar/[id]),
// mostra a imagem; senão, um círculo com a INICIAL e uma cor determinística (estilo Gmail).
// UI CRUA: dimensões/estilo finais são Claude Design. (REQ-032 / DEV-019)

// Paleta fixa; a cor sai de um hash do identificador → mesma pessoa, mesma cor sempre.
const COLORS = [
  "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e67e22",
  "#e74c3c", "#16a085", "#27ae60", "#2980b9", "#8e44ad",
  "#d35400", "#c0392b", "#f39c12", "#7f8c8d",
];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

function initial(name: string | null, email: string): string {
  const base = (name && name.trim()) || email;
  const ch = base.trim().charAt(0);
  return (ch || "?").toUpperCase();
}

export default function Avatar({
  name,
  email,
  avatarUrl,
  size = 32,
}: {
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatarUrl}
        alt={name ?? email}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        data-testid="avatar-img"
      />
    );
  }
  const color = COLORS[hashIndex(email || name || "?", COLORS.length)];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white select-none"
      style={{ width: size, height: size, backgroundColor: color, fontSize: Math.round(size * 0.45) }}
      data-testid="avatar-inicial"
      aria-label={name ?? email}
    >
      {initial(name, email)}
    </span>
  );
}
