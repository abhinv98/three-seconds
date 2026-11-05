import { AuthFrame, NoticeCard } from "@/components/account/auth-frame";

export default function ShareNotFound() {
  return (
    <AuthFrame>
      <NoticeCard title="This link doesn&rsquo;t work any more">
        <p>Whoever shared it may have turned it off. Ask them for a new one.</p>
      </NoticeCard>
    </AuthFrame>
  );
}
