import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function BrainstormingLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="brainstorming"
        lang="en"
        title="Voice Note to Mind Map & Project Plan — ProMapper"
        description="Turn 10-minute voice rants, brain-dumps, and story notes into interactive topic constellations, clear next steps, and structured Markdown plans."
        breadcrumbLabel="Voice Notes & Brainstorming"
      />
      <VerticalStudioIsland kind="brainstorming" lang="en" />
    </>
  );
}
