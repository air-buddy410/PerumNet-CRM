// Deklarasi minimum untuk net-snmp — hanya permukaan yang kita pakai.
// Paket resminya tidak menyediakan tipe, dan @types/net-snmp tidak ada.
declare module "net-snmp" {
  export interface Varbind {
    oid: string;
    value: unknown;
  }
  export interface Session {
    get(oids: string[], cb: (error: Error | null, varbinds: Varbind[]) => void): void;
    close(): void;
  }
  export const Version2c: unknown;
  export function createSession(
    target: string,
    community: string,
    options?: { version?: unknown; timeout?: number; retries?: number; port?: number }
  ): Session;
  export function isVarbindError(vb: Varbind): boolean;
  const snmp: {
    Version2c: unknown;
    createSession: typeof createSession;
    isVarbindError: typeof isVarbindError;
  };
  export default snmp;
}
