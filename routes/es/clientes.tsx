import VerticalLandingHead from "../../components/VerticalLandingHead.tsx";
import VerticalStudioIsland from "../../islands/VerticalStudioIsland.tsx";

export default function ClientesLandingPage() {
  return (
    <>
      <VerticalLandingHead
        kind="clients"
        lang="es"
        title="Notas de Sesiones con Clientes, Coaching y PDF en 1 Clic — ProMapper"
        description="Convierte sesiones de coaching, consultoría y asesorías en mapas vivos por cliente donde las tareas se palomean solas y exporta resúmenes en PDF o presentaciones en 1 clic."
        breadcrumbLabel="Sesiones con Clientes y Asesorías"
      />
      <VerticalStudioIsland kind="clients" lang="es" />
    </>
  );
}
