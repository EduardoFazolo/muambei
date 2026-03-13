import type { Metadata } from "next";
import {
  Fraunces,
  IBM_Plex_Mono,
  Manrope,
} from "next/font/google";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Muambei | Produto, exterior e viagem no mesmo fluxo",
  description:
    "Pesquise o produto no Brasil, compare precos fora do pais e so depois rode o workflow completo de viagem.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${fraunces.variable} ${manrope.variable} ${ibmPlexMono.variable} min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
