export interface EstadoAccion {
  ok?: boolean;
  error?: string;
  mensaje?: string;
}

export interface ResultadoImportacion extends EstadoAccion {
  creados?: number;
  actualizados?: number;
  errores?: { fila: number; error: string }[];
}

export interface ResultadoInvitacion extends EstadoAccion {
  credenciales?: { email: string; password: string };
}
