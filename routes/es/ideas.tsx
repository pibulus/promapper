import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function IdeasLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="brainstorming"
        lang="es"
        title="De Notas de Voz a Mapas Mentales y Planes de Proyecto — ProMapper"
        description="Convierte notas de voz largas, lluvia de ideas y apuntes sueltos en constelaciones visuales de temas, siguientes pasos y planes en Markdown."
        breadcrumbLabel="Notas de Voz y Lluvia de Ideas"
      />
      <VerticalStudioIsland kind="brainstorming" lang="es" />
    </>
  );
}
