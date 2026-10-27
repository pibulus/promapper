import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function JuntasLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="meetings"
        lang="es"
        title="Minutas de Juntas y Mapas de Acuerdos (Sin Bots) — ProMapper"
        description="Convierte juntas semanales y audios de trabajo en mapas vivos de temas, transcripciones por hablante y pendientes que se palomean solos en la siguiente toma."
        breadcrumbLabel="Juntas y Acuerdos de Proyecto"
      />
      <VerticalStudioIsland kind="meetings" lang="es" />
    </>
  );
}
