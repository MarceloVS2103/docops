/** Aplica las migraciones pendientes (útil contra Supabase antes del primer deploy). */
import { closeDb, getDb } from "../src/lib/db";

getDb()
  .then(async () => {
    console.log("Migraciones aplicadas.");
    await closeDb();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
