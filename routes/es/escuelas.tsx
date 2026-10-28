import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function EscuelasLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="schools"
        lang="es"
        title="Mapas de Clases, Juntas Escolares y Laboratorios Universitarios — ProMapper"
        description="Convierte clases universitarias, seminarios de investigación, juntas escolares y grupos de estudio en mapas conceptuales interactivos, presentaciones de diapositivas y guías PDF en 1 clic."
        breadcrumbLabel="Escuelas, Laboratorios y Grupos de Estudio"
      />
      <VerticalStudioIsland kind="schools" lang="es" />
    </>
  );
}
