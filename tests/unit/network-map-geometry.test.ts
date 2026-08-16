import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { customerCoordinateSourceOf } from "@/components/network-map-geometry";

describe("customerCoordinateSourceOf", () => {
  const odp = { latitude: -8.45, longitude: 115.62 };

  test("menandai customer yang memakai titik ODP", () => {
    assert.equal(
      customerCoordinateSourceOf({ latitude: -8.45, longitude: 115.62 }, odp),
      "ODP_INHERITED",
    );
  });

  test("mempertahankan customer dengan koordinat sendiri", () => {
    assert.equal(
      customerCoordinateSourceOf({ latitude: -8.451, longitude: 115.621 }, odp),
      "CUSTOMER_COORDINATE",
    );
  });

  test("tanpa ODP tidak menebak lokasi warisan", () => {
    assert.equal(
      customerCoordinateSourceOf({ latitude: -8.45, longitude: 115.62 }, null),
      "CUSTOMER_COORDINATE",
    );
  });
});
