export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="grid size-8 place-items-center rounded-md bg-marca-600 text-sm font-bold text-white">D</span>
            DocOps
          </div>
          <p className="mt-1 text-sm text-slate-500">Vigencia documental de operarios, al día y sin Excel.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
