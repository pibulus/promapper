import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function InvestigacionLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="research"
        lang="es"
        title="Mapeo de Entrevistas, Periodismo e Investigación de Campo — ProMapper"
        description="Convierte entrevistas, testimonios y notas de campo en grafos de temas conectados, transcripciones por hablante y reportes de Preguntas No Hechas — local en tu navegador."
        breadcrumbLabel="Investigación y Entrevistas"
      />
      <VerticalStudioIsland kind="research" lang="es" />
    </>
  );
}
