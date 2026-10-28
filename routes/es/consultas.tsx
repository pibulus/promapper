import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function ConsultasLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="care"
        lang="es"
        title="Notas de Consultas Médicas, Pediatra y Mapas de Cuidado Familiar — ProMapper"
        description="Convierte visitas al pediatra, consultas con especialistas y terapias en mapas claros de cuidado familiar, listas de indicaciones, preguntas para la siguiente cita y PDF imprimible."
        breadcrumbLabel="Consultas Médicas y Cuidado Familiar"
      />
      <VerticalStudioIsland kind="care" lang="es" />
    </>
  );
}
