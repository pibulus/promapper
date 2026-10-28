import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function ClientsLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="clients"
        lang="en"
        title="Client Session Notes, Coaching Maps & 1-Click PDF Recaps — ProMapper"
        description="Turn coaching, consulting, freelance, and tutoring sessions into living client boards where homework checks itself off and 1-click PDF or Slide-O-Matic decks export in seconds."
        breadcrumbLabel="Client Sessions & Coaching Maps"
      />
      <VerticalStudioIsland kind="clients" lang="en" />
    </>
  );
}
