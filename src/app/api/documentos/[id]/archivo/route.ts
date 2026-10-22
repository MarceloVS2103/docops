import { obtenerSesion } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { leerArchivo } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obtenerSesion();
  if (!s) return new Response("No autenticado", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado", { status: 404 });

  // RLS: si el documento es de otra empresa, la consulta no devuelve nada.
  const [doc] = await withTenant(s.empresaId, (q) =>
    q.query<{ archivo_path: string; archivo_mime: string; archivo_nombre: string }>(
      "select archivo_path, archivo_mime, archivo_nombre from documentos_operario where id = $1",
      [id],
    ),
  );
  if (!doc) return new Response("No encontrado", { status: 404 });

  const data = await leerArchivo(doc.archivo_path);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": doc.archivo_mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.archivo_nombre)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
