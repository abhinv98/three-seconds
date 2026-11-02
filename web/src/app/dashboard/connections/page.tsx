import { CopyLink } from "@/components/account/copy-link";
import { EmptyState, Notice, PageHeader, Panel, when } from "@/components/account/bits";
import { InviteBrandForm } from "@/components/account/invite-brand-form";
import { brandCreators, creatorBrands, requireMember, siteOrigin } from "@/lib/account";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireMember("/dashboard/connections");
  const origin = await siteOrigin();
  const query = await searchParams;
  const joined = typeof query.joined === "string" ? query.joined : null;
  const claimed = typeof query.claimed === "string" ? query.claimed : null;

  if (viewer.brand) {
    const creators = await brandCreators(viewer.brand.id);
    return (
      <div className="grid gap-6">
        <PageHeader title="Creators" description={`The creators who make Reels for ${viewer.brand.name}. Reels they send land in your folder.`} />
        {claimed ? <Notice>You&rsquo;re connected to {claimed}. Their Reels can come to you now.</Notice> : null}
        <Panel title="Invite creators">
          <div className="grid gap-3 p-5">
            <p className="text-sm text-muted-foreground">Anyone who joins with this link can send you Reels. Share it with the creators you hire.</p>
            <CopyLink url={`${origin}/join/${viewer.brand.invite_code}`} />
          </div>
        </Panel>
        <Panel title={`${creators.length} ${creators.length === 1 ? "creator" : "creators"}`}>
          {creators.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                    <th className="px-5 py-2.5 font-semibold">Creator</th>
                    <th className="px-3 py-2.5 font-semibold">Email</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Reels sent</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((c) => (
                    <tr key={c.creator_id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <span className="font-semibold">{c.display_name}</span>
                        {c.handle ? <span className="ml-2 text-muted-foreground">@{c.handle}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{c.email}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{c.reels_sent}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap text-muted-foreground tabular-nums">{when(c.joined_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No creators yet" body="Send your invite link to the creators you work with. They show up here when they join." />
          )}
        </Panel>
      </div>
    );
  }

  const brands = await creatorBrands(viewer.user.id);
  return (
    <div className="grid gap-6">
      <PageHeader title="Brands" description="The brands you make Reels for. Connect one and you can send it your checked Reels, report and all." />
      {joined ? <Notice>You joined {joined}&rsquo;s folder. Send them a Reel from its report.</Notice> : null}
      <Panel title="Connect a brand">
        <InviteBrandForm origin={origin} />
        <p className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground">Already on Three Seconds? Ask the brand for their invite link and open it.</p>
      </Panel>
      <Panel title={`${brands.length} ${brands.length === 1 ? "brand" : "brands"}`}>
        {brands.length ? (
          <ul>
            {brands.map((b) => (
              <li key={b.id} className="grid gap-3 border-b border-border px-5 py-4 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">{b.brand_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {b.brand_id ? `Connected · ${b.reels_sent} sent` : `Invite sent ${when(b.created_at)} · waiting for them to open it`}
                  </span>
                </div>
                {b.brand_website ? <span className="-mt-2 text-[13px] text-muted-foreground">{b.brand_website.replace(/^https:\/\//, "")}</span> : null}
                {!b.brand_id && b.invite_token ? <CopyLink url={`${origin}/invite/${b.invite_token}`} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No brands yet" body="Add a brand above and send them the link. Once they open it, your Reels can go to their folder." />
        )}
      </Panel>
    </div>
  );
}
