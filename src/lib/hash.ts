import bcrypt from "bcryptjs";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verificarPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
