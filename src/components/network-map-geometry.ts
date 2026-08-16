import type { MapCustomer, MapOdp } from "@/lib/noc-map";

export type CustomerCoordinateSource = "CUSTOMER_COORDINATE" | "ODP_INHERITED";

export const CUSTOMER_COORDINATE_SOURCE_LABEL: Record<CustomerCoordinateSource, string> = {
  CUSTOMER_COORDINATE: "Koordinat customer",
  ODP_INHERITED: "Lokasi mengikuti ODP (perkiraan)",
};

/**
 * loadNetworkMap mengembalikan koordinat ODP saat koordinat customer kosong.
 * DTO belum membawa asal koordinat, jadi renderer memakai perbandingan yang
 * sama dengan aturan garis ODP → customer sebagai penanda visual sementara.
 */
export function customerCoordinateSourceOf(
  customer: Pick<MapCustomer, "latitude" | "longitude">,
  odp: Pick<MapOdp, "latitude" | "longitude"> | null | undefined,
): CustomerCoordinateSource {
  return odp && customer.latitude === odp.latitude && customer.longitude === odp.longitude
    ? "ODP_INHERITED"
    : "CUSTOMER_COORDINATE";
}
