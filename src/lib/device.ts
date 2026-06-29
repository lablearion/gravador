// Heurística de device pelo user-agent (server-side). Paliativo (DEC-017): decide a tela inicial
// pós-login — mobile → Gravar, desktop → Gravações. Não é detecção perfeita; é palpite por regra
// (um UA pode mentir), suficiente para o landing. NÃO usar para segurança/feature-gating.
export function isMobileUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

// Tela inicial conforme o device (DEC-017).
export function landingPath(ua: string | null | undefined): string {
  return isMobileUA(ua) ? "/gravar" : "/recordings";
}
