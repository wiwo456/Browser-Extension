import HeroSection from "@/components/ui/glassmorphism-trust-hero";

interface HeroDemoProps {
  onOpenDashboard: () => void;
}

export default function HeroDemo({ onOpenDashboard }: HeroDemoProps) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-950">
      <HeroSection onOpenDashboard={onOpenDashboard} />
      <section className="relative z-10 mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">See the pattern</p>
            <h2 className="mb-3 text-2xl font-semibold text-white">Know where your time goes</h2>
            <p className="text-sm leading-7 text-zinc-400">
              Doom2Bloom highlights the sites, sessions, and repeated habits that quietly consume your attention during the day.
            </p>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Reduce the drag</p>
            <h2 className="mb-3 text-2xl font-semibold text-white">Catch distraction early</h2>
            <p className="text-sm leading-7 text-zinc-400">
              Use your browsing records to spot when quick checks turn into long scroll sessions before the whole afternoon disappears.
            </p>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">Build better loops</p>
            <h2 className="mb-3 text-2xl font-semibold text-white">Turn awareness into habits</h2>
            <p className="text-sm leading-7 text-zinc-400">
              The goal is not guilt. It is clarity, consistency, and a browser routine that supports the kind of day you want.
            </p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">How it works</p>
            <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white">A calmer loop for daily browsing</h2>
            <div className="space-y-4 text-sm leading-7 text-zinc-400">
              <p>
                Keep the extension running while you browse. Doom2Bloom records active tab sessions, tracks how long you stay on each
                site, and groups that time into a simple daily view.
              </p>
              <p>
                When you open the dashboard, you can review your top sites, your recent sessions, and the places that are repeatedly
                pulling you away from what you meant to do.
              </p>
              <p>
                Over time, that gives you a practical picture of your attention instead of a vague feeling that you were online all day.
              </p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">What you get</p>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <h3 className="mb-1 text-lg font-medium text-white">Live session tracking</h3>
                <p className="text-sm leading-6 text-zinc-400">Active tabs are timed so your daily records reflect real browsing time, not guesswork.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <h3 className="mb-1 text-lg font-medium text-white">Daily site breakdowns</h3>
                <p className="text-sm leading-6 text-zinc-400">See which domains absorb the most time and how often you return to them.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <h3 className="mb-1 text-lg font-medium text-white">A visible reset point</h3>
                <p className="text-sm leading-6 text-zinc-400">The dashboard gives you a clear moment to notice the pattern and choose a better next step.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
