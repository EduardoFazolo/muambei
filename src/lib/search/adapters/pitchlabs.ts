import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { SearchOffer, StoreAdapter } from "@/lib/search/types";
import { cleanOffers, providerResult } from "@/lib/search/utils";

const execAsync = promisify(exec);

type PitchlabsPayload = SearchOffer[] | { offers?: SearchOffer[] };

export const pitchlabsAdapter: StoreAdapter = {
  storeKey: "pitchlabs-magalu",
  storeName: "Magalu",
  async search(query) {
    const startedAt = Date.now();
    const template = process.env.PITCHLABS_COMMAND;

    if (!template) {
      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        latencyMs: Date.now() - startedAt,
        status: "not_configured",
        note:
          "Defina PITCHLABS_COMMAND com um comando que imprima JSON normalizado no stdout.",
      });
    }

    try {
      const command = template
        .replaceAll("{query}", query.replaceAll('"', '\\"'))
        .replaceAll("{store}", this.storeKey);

      const { stdout } = await execAsync(command, {
        timeout: 20_000,
        maxBuffer: 1024 * 1024 * 4,
      });

      const payload = JSON.parse(stdout.trim()) as PitchlabsPayload;
      const offers = Array.isArray(payload) ? payload : payload.offers ?? [];

      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        offers: cleanOffers(
          offers.map((offer) => ({
            ...offer,
            storeKey: this.storeKey,
            storeName: this.storeName,
            source: "pitchlabs",
            currency: "BRL",
          })),
          query,
        ),
        latencyMs: Date.now() - startedAt,
        note: "Saída recebida do agente externo pitchlabs.",
      });
    } catch (error) {
      return providerResult({
        storeKey: this.storeKey,
        storeName: this.storeName,
        latencyMs: Date.now() - startedAt,
        status: "error",
        note:
          error instanceof Error
            ? error.message
            : "Pitchlabs não retornou JSON válido.",
      });
    }
  },
};
