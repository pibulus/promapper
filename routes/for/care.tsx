import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function CareLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="care"
        lang="en"
        title="Doctor, Pediatrician & Specialist Visit Notes to Family Care Maps — ProMapper"
        description="Turn fast pediatrician, doctor, and therapy visits into clear family care checklists, connected symptom maps, Unasked Questions for follow-up, and printable PDF summaries."
        breadcrumbLabel="Doctor, Pediatric & Care Visit Maps"
      />
      <VerticalStudioIsland kind="care" lang="en" />
    </>
  );
}
