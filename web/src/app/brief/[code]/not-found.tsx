import { AuthFrame, NoticeCard } from "@/components/account/auth-frame";

export default function BriefNotFound() {
  return (
    <AuthFrame>
      <NoticeCard title="This brief isn&rsquo;t here">
        <p>The link may be wrong. Ask the brand to send it again.</p>
      </NoticeCard>
    </AuthFrame>
  );
}
