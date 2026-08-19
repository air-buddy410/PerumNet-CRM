// Merekam sesi apa adanya: masuk, kirim perintah berjeda, dump semuanya.
import net from "node:net";
import { bacaKredensialOlt } from "@/lib/olt-telnet";
const [host, port, env] = [process.argv[2], Number(process.argv[3]), process.argv[4]];
const perintah = process.argv.slice(5);
const k = bacaKredensialOlt(env);
const sock = new net.Socket();
let buffer = "", tahap = "USER", semua = "";
const kirimBerikut = () => {
  const c = perintah.shift();
  if (c === undefined) { setTimeout(() => { console.log(semua.slice(-3000)); process.exit(0); }, 800); return; }
  console.log(`\n>>> ${c}`);
  sock.write(c + "\r\n");
  setTimeout(kirimBerikut, 3500);
};
setTimeout(() => { console.log(semua.slice(-3000)); process.exit(0); }, 40000);
sock.on("data", (chunk) => {
  const y = Uint8Array.from(chunk); const balas: number[] = []; const teks: number[] = [];
  for (let i = 0; i < y.length; i++) {
    if (y[i] === 255 && i + 2 < y.length) { if (y[i+1] === 253) balas.push(255,252,y[i+2]); else if (y[i+1] === 251) balas.push(255,254,y[i+2]); i += 2; }
    else teks.push(y[i]);
  }
  if (balas.length) sock.write(Buffer.from(balas));
  const t = Buffer.from(teks).toString("utf8");
  buffer += t; if (tahap === "MASUK") semua += t;
  const low = buffer.toLowerCase();
  if (tahap === "USER" && /(username|login)\s*:/.test(low)) { tahap = "PASS"; buffer = ""; sock.write(k.user + "\r\n"); return; }
  if (tahap === "PASS" && /password\s*:/.test(low)) { tahap = "MASUK"; buffer = ""; sock.write(k.password + "\r\n"); setTimeout(kirimBerikut, 2000); return; }
});
sock.on("error", (e) => { console.log("GAGAL:", e.message); process.exit(0); });
sock.connect(port, host);
