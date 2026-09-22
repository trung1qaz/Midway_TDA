import MemberForm from "@/components/MemberForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Midway
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Add everyone who&apos;s meeting up. Location can be vague —
          &quot;somewhere near downtown Chicago&quot; is fine.
        </p>
      </div>
      <MemberForm />
    </main>
  );
}
