import { useEffect, useRef } from "react";

interface Props {
  value: string;
  size?: number;
}

export default function QRCode({ value, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellSize = Math.floor(size / 25);
    const actualSize = cellSize * 25;
    canvas.width = actualSize;
    canvas.height = actualSize;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, actualSize, actualSize);

    const hash = Array.from(value).reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0);

    const seeded = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
      };
    };
    const rand = seeded(Math.abs(hash));

    ctx.fillStyle = "#000000";

    const drawFinder = (x: number, y: number) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(x * cellSize, y * cellSize, 7 * cellSize, 7 * cellSize);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect((x + 1) * cellSize, (y + 1) * cellSize, 5 * cellSize, 5 * cellSize);
      ctx.fillStyle = "#000000";
      ctx.fillRect((x + 2) * cellSize, (y + 2) * cellSize, 3 * cellSize, 3 * cellSize);
    };

    drawFinder(0, 0);
    drawFinder(18, 0);
    drawFinder(0, 18);

    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 25; col++) {
        if ((row < 8 && col < 8) || (row < 8 && col > 16) || (row > 16 && col < 8)) continue;
        if (rand() > 0.5) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    const centerX = actualSize / 2;
    const centerY = actualSize / 2;
    const logoSize = cellSize * 4;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(centerX - logoSize / 2 - 2, centerY - logoSize / 2 - 2, logoSize + 4, logoSize + 4);
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${cellSize * 2}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🛡️", centerX, centerY);
  }, [value, size]);

  return (
    <div className="bg-white p-3 rounded-xl shadow-lg">
      <canvas ref={canvasRef} className="block" style={{ width: size, height: size }} />
    </div>
  );
}
