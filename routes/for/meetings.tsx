import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function MeetingsLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="meetings"
        lang="en"
        title="Weekly Meeting Notes & Action Maps (No Call Bot) — ProMapper"
        description="Turn weekly meetings and project check-ins into living topic maps, speaker transcripts, and action items that check themselves off in later takes — with zero calendar bots."
        breadcrumbLabel="Weekly Meetings & Action Maps"
      />
      <VerticalStudioIsland kind="meetings" lang="en" />
    </>
  );
}
