import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function SchoolsLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="schools"
        lang="en"
        title="Visual Lecture Maps, IEP Conferences & Uni Research Lab Notes — ProMapper"
        description="Turn university seminars, PhD research lab meetings, IEP conferences, and study groups into shared visual concept maps, 1-click Slide-O-Matic presentation decks, and printable PDF guides."
        breadcrumbLabel="Schools, IEP Conferences & Research Labs"
      />
      <VerticalStudioIsland kind="schools" lang="en" />
    </>
  );
}
