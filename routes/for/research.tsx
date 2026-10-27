import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function ResearchLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="research"
        lang="en"
        title="Qualitative Interview, Journalism & Case File Mapper — ProMapper"
        description="Map multi-speaker interviews, field notes, and depositions into connected entity graphs, speaker-attributed transcripts, and Unasked Questions briefs — 100% local-first."
        breadcrumbLabel="Research, Interviews & Case Files"
      />
      <VerticalStudioIsland kind="research" lang="en" />
    </>
  );
}
