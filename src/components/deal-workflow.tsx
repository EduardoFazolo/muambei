"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  OverseasMarketOffer,
  OverseasResearchResponse,
  TicketResearchOption,
  TripPlanResponse,
  WorkflowEvent,
  WorkflowStepStatus,
} from "@/lib/deal-workflow/types";
import type { SearchOffer, SearchResponse } from "@/lib/search/types";

type WorkflowStep = {
  stepId: string;
  label: string;
  status: WorkflowStepStatus;
  message: string;
};

type AsyncWorkflowState<T> = {
  status: "idle" | "running" | "ready" | "error";
  error: string;
  result: T | null;
  steps: WorkflowStep[];
};

type TripBrief = {
  origin: string;
  travelers: string;
  tripLengthNights: string;
  stayPreference: string;
  priorities: string;
};

const SAMPLE_QUERIES = [
  "iphone 15",
  "playstation 5 slim",
  "macbook air m3",
  "air fryer philips walita",
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function emptyWorkflow<T>(): AsyncWorkflowState<T> {
  return {
    status: "idle",
    error: "",
    result: null,
    steps: [],
  };
}

function initialTripBrief(): TripBrief {
  return {
    origin: "Sao Paulo (GRU)",
    travelers: "1 adulto",
    tripLengthNights: "3",
    stayPreference: "Apartamento simples ou hotel pratico perto de transporte.",
    priorities: "Maximizar economia total sem sacrificar seguranca e logistica.",
  };
}

function offerKey(offer: Pick<SearchOffer, "storeKey" | "url">) {
  return `${offer.storeKey}:${offer.url}`;
}

function overseasOfferKey(offer: Pick<OverseasMarketOffer, "id">) {
  return offer.id;
}

function statusLabel(status: SearchResponse["providers"][number]["status"]) {
  switch (status) {
    case "ok":
      return "ativo";
    case "empty":
      return "sem match";
    case "not_configured":
      return "na fila";
    case "error":
      return "bloqueado";
    default:
      return "parcial";
  }
}

function providerTone(status: SearchResponse["providers"][number]["status"]) {
  switch (status) {
    case "ok":
      return "tone-good";
    case "error":
      return "tone-bad";
    case "not_configured":
      return "tone-warn";
    default:
      return "tone-soft";
  }
}

function stepTone(status: WorkflowStepStatus) {
  switch (status) {
    case "completed":
      return "tone-good";
    case "running":
      return "tone-active";
    case "error":
      return "tone-bad";
    default:
      return "tone-soft";
  }
}

function regionLabel(region: OverseasMarketOffer["region"]) {
  return region === "united_states" ? "Estados Unidos" : "Europa";
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : shortDate.format(parsed);
}

function formatWindow(option: TicketResearchOption) {
  return `${formatDate(option.departureWindow.start)} - ${formatDate(option.departureWindow.end)} / volta ${formatDate(option.returnWindow.start)} - ${formatDate(option.returnWindow.end)}`;
}

function mergeStep(
  steps: WorkflowStep[],
  incoming: Pick<WorkflowStep, "stepId" | "label" | "status" | "message">,
) {
  const index = steps.findIndex((step) => step.stepId === incoming.stepId);
  if (index === -1) {
    return [...steps, incoming];
  }

  const copy = [...steps];
  copy[index] = {
    ...copy[index],
    ...incoming,
  };
  return copy;
}

async function readWorkflowStream<T>({
  payload,
  workflow,
  signal,
  onStep,
  onResult,
}: {
  payload: Record<string, unknown>;
  workflow: "overseas" | "trip";
  signal: AbortSignal;
  onStep: (event: Extract<WorkflowEvent, { type: "step.updated" }>) => void;
  onResult: (value: T) => void;
}) {
  const response = await fetch("/api/workflow", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      workflow,
      ...payload,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const fallback = await response.json().catch(() => null);
    throw new Error(
      fallback?.error ??
        `Nao foi possivel iniciar o workflow ${workflow}.`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n")) {
      const newlineIndex = buffer.indexOf("\n");
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      const event = JSON.parse(line) as WorkflowEvent;
      if (event.type === "step.updated") {
        onStep(event);
        continue;
      }

      if (event.type === "result" && event.workflow === workflow) {
        onResult(event.data as T);
        continue;
      }

      if (event.type === "error" && event.workflow === workflow) {
        streamError = event.message;
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
}

function WorkflowRail({
  title,
  description,
  steps,
}: {
  title: string;
  description: string;
  steps: WorkflowStep[];
}) {
  return (
    <article className="panel-soft rounded-[1.8rem] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker text-[var(--brand-300)]">{title}</p>
          <h3 className="mt-3 font-display text-3xl text-[var(--ink-0)]">
            {description}
          </h3>
        </div>
        <span className="code-chip">{steps.length} passos</span>
      </div>

      <div className="mt-5 space-y-3">
        {steps.map((step) => (
          <div
            key={step.stepId}
            className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--ink-0)]">
                {step.label}
              </p>
              <span className={`status-pill ${stepTone(step.status)}`}>
                {step.status}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
              {step.message}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function SourcePills({
  sources,
}: {
  sources: { label: string; url: string; note: string }[];
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {sources.map((source) => (
        <a
          key={`${source.label}-${source.url}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="action-pill"
          title={source.note}
        >
          {source.label}
        </a>
      ))}
    </div>
  );
}

function SearchOfferCard({
  offer,
  selected,
  onSelect,
}: {
  offer: SearchOffer;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`product-card rounded-[1.7rem] p-5 ${
        selected ? "product-card-selected" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="kicker text-[var(--ink-muted)]">{offer.storeName}</p>
          <h3 className="mt-3 text-xl font-semibold leading-7 text-[var(--ink-0)]">
            {offer.title}
          </h3>
        </div>
        <span className="code-chip">{offer.source}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker text-[var(--ink-subtle)]">Brasil agora</p>
          <p className="mt-2 font-display text-5xl leading-none text-[var(--ink-0)]">
            {money.format(offer.price)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSelect}
          className={`action-pill ${selected ? "action-pill-primary" : ""}`}
        >
          {selected ? "Produto base" : "Usar produto"}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {offer.installments ? (
          <span className="meta-pill">{offer.installments}</span>
        ) : null}
        {offer.shipping ? <span className="meta-pill">{offer.shipping}</span> : null}
        {offer.seller ? <span className="meta-pill">Seller {offer.seller}</span> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={offer.url}
          target="_blank"
          rel="noreferrer"
          className="action-pill"
        >
          Abrir oferta
        </a>
      </div>
    </article>
  );
}

function OverseasOfferCard({
  offer,
  selected,
  onSelect,
}: {
  offer: OverseasMarketOffer;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`product-card rounded-[1.7rem] p-5 ${
        selected ? "product-card-selected" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker text-[var(--brand-300)]">
            {regionLabel(offer.region)} • {offer.city}, {offer.country}
          </p>
          <h3 className="mt-3 text-xl font-semibold leading-7 text-[var(--ink-0)]">
            {offer.offerTitle}
          </h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {offer.storeName} via {offer.purchaseChannel}
          </p>
        </div>
        <span className={`status-pill ${stepTone(offer.confidence === "high" ? "completed" : offer.confidence === "medium" ? "running" : "pending")}`}>
          {offer.confidence}
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
          <p className="kicker text-[var(--ink-subtle)]">Preco local</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--ink-0)]">
            {offer.priceLocalDisplay}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
          <p className="kicker text-[var(--ink-subtle)]">Equivalente BRL</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--ink-0)]">
            {money.format(offer.estimatedPriceBRL)}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
          <p className="kicker text-[var(--ink-subtle)]">Diferenca</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--brand-300)]">
            {money.format(offer.estimatedSavingsVsBrazilBRL)}
          </p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-7 text-[var(--ink-muted)]">
        {offer.whyItWins}
      </p>
      <p className="mt-3 text-sm text-[var(--brand-200)]">
        Estoque e canal: {offer.stockSignal}
      </p>

      {offer.caveats.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {offer.caveats.map((item) => (
            <span key={item} className="meta-pill">
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSelect}
          className={`action-pill ${selected ? "action-pill-primary" : ""}`}
        >
          {selected ? "Destino ativo" : "Usar este destino"}
        </button>
      </div>

      <SourcePills sources={offer.sources} />
    </article>
  );
}

function TicketCard({
  option,
  selected,
}: {
  option: TicketResearchOption;
  selected: boolean;
}) {
  return (
    <article
      className={`panel-soft rounded-[1.7rem] p-5 ${
        selected ? "product-card-selected" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker text-[var(--brand-300)]">
            {selected ? "Janela principal" : "Alternativa"}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-[var(--ink-0)]">
            {option.title}
          </h3>
        </div>
        <div className="text-right">
          <span className="code-chip">{option.confidence}</span>
          <p className="mt-3 font-display text-4xl text-[var(--ink-0)]">
            {option.displayPrice}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm text-[var(--ink-muted)]">{formatWindow(option)}</p>
      <p className="mt-4 text-sm leading-7 text-[var(--ink-muted)]">
        {option.whyItWins}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {option.typicalCarriers.map((carrier) => (
          <span key={carrier} className="meta-pill">
            {carrier}
          </span>
        ))}
        {option.bookingChannels.map((channel) => (
          <span key={channel} className="meta-pill meta-pill-brand">
            {channel}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {option.tradeoffs.map((tradeoff) => (
          <span key={tradeoff} className="meta-pill">
            {tradeoff}
          </span>
        ))}
      </div>

      <SourcePills sources={option.sources} />
    </article>
  );
}

function LodgingCard({
  option,
  selected,
}: {
  option: TripPlanResponse["lodgingOptions"][number];
  selected: boolean;
}) {
  return (
    <article
      className={`panel-soft rounded-[1.7rem] p-5 ${
        selected ? "product-card-selected" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker text-[var(--brand-300)]">
            {selected ? "Base principal" : "Base alternativa"}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-[var(--ink-0)]">
            {option.area}
          </h3>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {option.propertyStyle}
          </p>
        </div>
        <div className="text-right">
          <span className="code-chip">{option.confidence}</span>
          <p className="mt-3 font-display text-4xl text-[var(--ink-0)]">
            {option.totalStayDisplay}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-[var(--ink-muted)]">
        {option.whyItWins}
      </p>
      <p className="mt-3 text-sm text-[var(--brand-200)]">
        Acesso: {option.accessNotes}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="meta-pill">{option.nightlyDisplay} / noite</span>
        {option.bookingChannels.map((channel) => (
          <span key={channel} className="meta-pill meta-pill-brand">
            {channel}
          </span>
        ))}
      </div>

      <SourcePills sources={option.sources} />
    </article>
  );
}

export function DealWorkflow() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [search, setSearch] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    error: string;
    results: SearchResponse | null;
  }>({
    status: "idle",
    error: "",
    results: null,
  });
  const [selectedBrazilOfferId, setSelectedBrazilOfferId] = useState("");
  const [selectedOverseasOfferId, setSelectedOverseasOfferId] = useState("");
  const [tripBrief, setTripBrief] = useState<TripBrief>(initialTripBrief);
  const [overseas, setOverseas] = useState<
    AsyncWorkflowState<OverseasResearchResponse>
  >(() => emptyWorkflow());
  const [trip, setTrip] = useState<AsyncWorkflowState<TripPlanResponse>>(
    () => emptyWorkflow(),
  );
  const searchAbortRef = useRef<AbortController | null>(null);
  const overseasAbortRef = useRef<AbortController | null>(null);
  const tripAbortRef = useRef<AbortController | null>(null);

  const selectedBrazilOffer = useMemo(() => {
    if (!search.results) {
      return null;
    }
    return (
      search.results.offers.find((offer) => offerKey(offer) === selectedBrazilOfferId) ??
      search.results.offers[0] ??
      null
    );
  }, [search.results, selectedBrazilOfferId]);

  const selectedOverseasOffer = useMemo(() => {
    if (!overseas.result) {
      return null;
    }
    return (
      overseas.result.offers.find(
        (offer) => overseasOfferKey(offer) === selectedOverseasOfferId,
      ) ??
      overseas.result.offers.find(
        (offer) => offer.id === overseas.result?.recommendedOfferId,
      ) ??
      overseas.result.offers[0] ??
      null
    );
  }, [overseas.result, selectedOverseasOfferId]);

  useEffect(() => {
    const normalized = deferredQuery.trim();

    if (normalized.length < 3) {
      searchAbortRef.current?.abort();
      setSearch({
        status: normalized.length === 0 ? "idle" : "ready",
        error: "",
        results: null,
      });
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timeout = window.setTimeout(() => {
      setSearch((current) => ({
        ...current,
        status: "loading",
        error: "",
      }));

      void fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(
              payload?.error ?? "Nao foi possivel buscar o produto agora.",
            );
          }

          return response.json() as Promise<SearchResponse>;
        })
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }

          setSearch({
            status: "ready",
            error: "",
            results,
          });
          setSelectedBrazilOfferId((current) =>
            results.offers.some((offer) => offerKey(offer) === current)
              ? current
              : results.offers[0]
                ? offerKey(results.offers[0])
                : "",
          );
        })
        .catch((error: Error) => {
          if (controller.signal.aborted) {
            return;
          }
          setSearch({
            status: "error",
            error: error.message,
            results: null,
          });
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [deferredQuery]);

  useEffect(() => {
    setOverseas(emptyWorkflow());
    setTrip(emptyWorkflow());
    setSelectedOverseasOfferId("");
  }, [selectedBrazilOfferId]);

  useEffect(() => {
    const result = overseas.result;
    if (!result) {
      return;
    }

    setSelectedOverseasOfferId((current) =>
      result.offers.some((offer) => offer.id === current)
        ? current
        : result.recommendedOfferId,
    );
  }, [overseas.result]);

  useEffect(() => {
    setTrip(emptyWorkflow());
  }, [selectedOverseasOfferId]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      overseasAbortRef.current?.abort();
      tripAbortRef.current?.abort();
    };
  }, []);

  async function startOverseasWorkflow() {
    if (!selectedBrazilOffer || overseas.status === "running") {
      return;
    }

    const controller = new AbortController();
    overseasAbortRef.current?.abort();
    overseasAbortRef.current = controller;

    setOverseas({
      status: "running",
      error: "",
      result: null,
      steps: [],
    });

    try {
      await readWorkflowStream<OverseasResearchResponse>({
        payload: {
          query: query.trim(),
          referenceProduct: selectedBrazilOffer.title,
          brazilReferencePriceBRL: selectedBrazilOffer.price,
        },
        workflow: "overseas",
        signal: controller.signal,
        onStep: (event) => {
          setOverseas((current) => ({
            ...current,
            steps: mergeStep(current.steps, {
              stepId: event.stepId,
              label: event.label,
              status: event.status,
              message: event.message,
            }),
          }));
        },
        onResult: (result) => {
          setOverseas((current) => ({
            ...current,
            status: "ready",
            result,
          }));
        },
      });

      setOverseas((current) => ({
        ...current,
        status: current.result ? "ready" : "error",
        error: current.result ? "" : "Nenhum resultado internacional retornou.",
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setOverseas((current) => ({
        ...current,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel concluir a pesquisa internacional.",
      }));
    }
  }

  async function startTripWorkflow() {
    if (!selectedBrazilOffer || !selectedOverseasOffer || trip.status === "running") {
      return;
    }

    const controller = new AbortController();
    tripAbortRef.current?.abort();
    tripAbortRef.current = controller;

    setTrip({
      status: "running",
      error: "",
      result: null,
      steps: [],
    });

    try {
      await readWorkflowStream<TripPlanResponse>({
        payload: {
          productQuery: query.trim(),
          origin: tripBrief.origin,
          travelers: tripBrief.travelers,
          tripLengthNights: Number.parseInt(tripBrief.tripLengthNights, 10),
          stayPreference: tripBrief.stayPreference,
          priorities: tripBrief.priorities,
          brazilReferencePriceBRL: selectedBrazilOffer.price,
          selectedOffer: selectedOverseasOffer,
        },
        workflow: "trip",
        signal: controller.signal,
        onStep: (event) => {
          setTrip((current) => ({
            ...current,
            steps: mergeStep(current.steps, {
              stepId: event.stepId,
              label: event.label,
              status: event.status,
              message: event.message,
            }),
          }));
        },
        onResult: (result) => {
          setTrip((current) => ({
            ...current,
            status: "ready",
            result,
          }));
        },
      });

      setTrip((current) => ({
        ...current,
        status: current.result ? "ready" : "error",
        error: current.result ? "" : "Nao foi possivel montar a viagem.",
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setTrip((current) => ({
        ...current,
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel concluir a pesquisa de viagem.",
      }));
    }
  }

  const hasSearchResults = Boolean(search.results?.offers.length);
  const brazilBestPrice = search.results?.offers[0]?.price ?? null;
  const tripResult = trip.result;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="page-glow page-glow-top" />
      <div className="page-glow page-glow-side" />
      <div className="page-grid" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <section className="hero-shell rounded-[2.4rem] px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="kicker text-[var(--brand-300)]">
                Price Trip • produto no Brasil, decisao no mundo real
              </p>
              <h1 className="mt-5 max-w-4xl font-display text-5xl leading-[0.92] text-[var(--ink-0)] sm:text-6xl lg:text-7xl">
                Pare de procurar passagem antes de saber se o produto realmente compensa.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--ink-muted)] sm:text-lg">
                O fluxo certo e assim: voce digita o produto, escolhe a oferta
                brasileira que representa seu baseline, pesquisa o mesmo item
                nos Estados Unidos e na Europa, e so depois roda o workflow de
                voo + hospedagem para ver se a viagem fecha a conta.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {SAMPLE_QUERIES.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setQuery(sample)}
                    className="action-pill"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
              <p className="kicker text-[var(--brand-300)]">Workflow alvo</p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--ink-muted)]">
                <p>
                  1. Buscar produto no Brasil enquanto o usuario digita.
                </p>
                <p>
                  2. Deixar o usuario escolher a oferta-base correta, em vez de
                  assumir um match.
                </p>
                <p>
                  3. Pesquisar precos reais fora do Brasil com etapas visiveis.
                </p>
                <p>
                  4. Rodar a viagem pesada so quando existir um destino
                  comercial plausivel.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
          <aside className="space-y-5">
            <article className="hero-shell rounded-[1.9rem] p-5 sm:p-6">
              <p className="kicker text-[var(--brand-300)]">Etapa 1 • Brasil</p>
              <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                Digite o produto. A busca acontece sem submit.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--ink-muted)]">
                O baseline da decisao ainda e o mercado brasileiro, mas agora a
                busca responde enquanto voce escreve e deixa claro quais
                coletores realmente trouxeram resultado.
              </p>

              <label className="mt-6 block">
                <span className="sr-only">Buscar produto</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Digite um produto, ex: iphone 15"
                  className="search-input"
                />
              </label>

              <div className="mt-4 flex min-h-8 items-center text-sm text-[var(--ink-muted)]">
                {search.status === "loading"
                  ? "Pesquisando nos coletores brasileiros..."
                  : search.status === "error"
                    ? search.error
                    : hasSearchResults
                      ? `${search.results?.offers.length} ofertas normalizadas agora.`
                      : query.trim().length >= 3
                        ? "Nenhuma oferta forte ainda."
                        : "Comece com pelo menos 3 caracteres."}
              </div>
            </article>

            <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="kicker text-[var(--brand-300)]">Saude dos coletores</p>
                  <h3 className="mt-2 text-2xl font-semibold text-[var(--ink-0)]">
                    Quem esta de pe agora
                  </h3>
                </div>
                <span className="code-chip">
                  {search.results?.providers.length ?? 5} fontes
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                {(search.results?.providers ?? []).map((provider) => (
                  <div
                    key={provider.storeKey}
                    className="rounded-[1.2rem] border border-white/8 bg-black/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--ink-0)]">
                        {provider.storeName}
                      </p>
                      <span className={`status-pill ${providerTone(provider.status)}`}>
                        {statusLabel(provider.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                      {provider.note ?? `${provider.offers.length} resultados validos.`}
                    </p>
                  </div>
                ))}
                {!search.results ? (
                  <div className="rounded-[1.2rem] border border-dashed border-white/12 p-4 text-sm text-[var(--ink-muted)]">
                    A busca do produto precisa acontecer primeiro para expor quais
                    coletores estao vivos. Hoje, KaBuM e Americanas retornam
                    dados; Mercado Livre e Amazon BR estao sofrendo bloqueios de
                    origem.
                  </div>
                ) : null}
              </div>
            </article>

            <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
              <p className="kicker text-[var(--brand-300)]">Resumo rapido</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="kicker text-[var(--ink-subtle)]">Melhor BR</p>
                  <p className="mt-2 font-display text-4xl text-[var(--ink-0)]">
                    {brazilBestPrice ? money.format(brazilBestPrice) : "--"}
                  </p>
                </div>
                <div>
                  <p className="kicker text-[var(--ink-subtle)]">Produto base</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                    {selectedBrazilOffer?.title ?? "Selecione uma oferta para continuar."}
                  </p>
                </div>
              </div>
            </article>
          </aside>

          <div className="space-y-5">
            {hasSearchResults ? (
              <>
                <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="kicker text-[var(--brand-300)]">Ofertas brasileiras</p>
                      <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                        Escolha o item que realmente representa sua comparacao.
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={startOverseasWorkflow}
                      disabled={!selectedBrazilOffer || overseas.status === "running"}
                      className={`action-pill action-pill-primary ${
                        !selectedBrazilOffer || overseas.status === "running"
                          ? "opacity-60"
                          : ""
                      }`}
                    >
                      {overseas.status === "running"
                        ? "Pesquisando exterior..."
                        : "Pesquisar fora do Brasil"}
                    </button>
                  </div>
                </article>

                <div className="grid gap-5 lg:grid-cols-2">
                  {search.results?.offers.map((offer) => (
                    <SearchOfferCard
                      key={offerKey(offer)}
                      offer={offer}
                      selected={offerKey(offer) === selectedBrazilOfferId}
                      onSelect={() => setSelectedBrazilOfferId(offerKey(offer))}
                    />
                  ))}
                </div>
              </>
            ) : (
              <article className="hero-shell rounded-[1.9rem] border border-dashed border-white/12 p-8">
                <p className="kicker text-[var(--brand-300)]">Esperando produto</p>
                <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                  O app agora comeca no item, nao na passagem.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--ink-muted)]">
                  Digite o nome do produto. Assim que a busca brasileira tiver
                  resultado, a interface libera a pesquisa internacional e depois
                  o workflow de viagem.
                </p>
              </article>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[0.66fr_1.34fr]">
          <aside className="space-y-5">
            <article className="hero-shell rounded-[1.9rem] p-5 sm:p-6">
              <p className="kicker text-[var(--brand-300)]">Etapa 2 • Exterior</p>
              <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                Pesquisa internacional orientada pelo produto selecionado.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--ink-muted)]">
                Aqui entram os agentes de mercado. O objetivo nao e achar
                {" "}qualquer preco{" "}, mas sim oportunidades em cidades que facam sentido para
                uma viagem curta de compra.
              </p>
            </article>

            {overseas.steps.length > 0 ? (
              <WorkflowRail
                title="Workflow ao vivo"
                description="A UI precisa mostrar progresso real enquanto a pesquisa acontece."
                steps={overseas.steps}
              />
            ) : (
              <article className="panel-soft rounded-[1.8rem] p-5">
                <p className="kicker text-[var(--brand-300)]">Pronto para rodar</p>
                <p className="mt-3 text-sm leading-7 text-[var(--ink-muted)]">
                  Selecione uma oferta brasileira e dispare a pesquisa
                  internacional. Este bloco passa a mostrar os agentes e suas
                  mensagens enquanto o backend esta trabalhando.
                </p>
              </article>
            )}

            {overseas.error ? (
              <article className="rounded-[1.6rem] border border-[var(--bad)]/35 bg-[var(--bad-soft)] p-4 text-sm leading-6 text-[var(--ink-0)]">
                {overseas.error}
              </article>
            ) : null}
          </aside>

          <div className="space-y-5">
            {overseas.result ? (
              <>
                <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="kicker text-[var(--brand-300)]">Leitura internacional</p>
                      <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                        {overseas.result.summary}
                      </h2>
                    </div>
                    <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-4">
                      <p className="kicker text-[var(--ink-subtle)]">Referencia BR</p>
                      <p className="mt-2 font-display text-4xl text-[var(--ink-0)]">
                        {money.format(overseas.result.brazilReferencePriceBRL)}
                      </p>
                    </div>
                  </div>

                  {overseas.result.warnings.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {overseas.result.warnings.map((warning) => (
                        <span key={warning} className="meta-pill">
                          {warning}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>

                <div className="grid gap-5 lg:grid-cols-2">
                  {overseas.result.offers.map((offer) => (
                    <OverseasOfferCard
                      key={offer.id}
                      offer={offer}
                      selected={offer.id === selectedOverseasOfferId}
                      onSelect={() => setSelectedOverseasOfferId(offer.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <article className="panel-soft rounded-[1.9rem] border border-dashed border-white/12 p-8">
                <p className="kicker text-[var(--brand-300)]">Esperando pesquisa</p>
                <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                  O destino comercial nasce aqui.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--ink-muted)]">
                  Assim que a pesquisa internacional terminar, voce escolhe qual
                  mercado faz sentido perseguir. So depois disso o sistema abre a
                  busca pesada de passagem e hospedagem.
                </p>
              </article>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[0.68fr_1.32fr]">
          <aside className="space-y-5">
            <article className="hero-shell rounded-[1.9rem] p-5 sm:p-6">
              <p className="kicker text-[var(--brand-300)]">Etapa 3 • Viagem</p>
              <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                Voos primeiro. Hospedagem depois. Conta final no fim.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--ink-muted)]">
                Esta etapa so deve existir depois da escolha do destino
                comercial. O workflow usa a oferta internacional escolhida para
                buscar janelas de voo e depois bases de hospedagem compativeis.
              </p>

              <div className="mt-6 space-y-4">
                <label className="block space-y-2">
                  <span className="kicker text-[var(--ink-subtle)]">Origem</span>
                  <input
                    value={tripBrief.origin}
                    onChange={(event) =>
                      setTripBrief((current) => ({
                        ...current,
                        origin: event.target.value,
                      }))
                    }
                    className="field-input"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="kicker text-[var(--ink-subtle)]">Viajantes</span>
                    <input
                      value={tripBrief.travelers}
                      onChange={(event) =>
                        setTripBrief((current) => ({
                          ...current,
                          travelers: event.target.value,
                        }))
                      }
                      className="field-input"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="kicker text-[var(--ink-subtle)]">Noites</span>
                    <input
                      type="number"
                      min={2}
                      max={7}
                      value={tripBrief.tripLengthNights}
                      onChange={(event) =>
                        setTripBrief((current) => ({
                          ...current,
                          tripLengthNights: event.target.value,
                        }))
                      }
                      className="field-input"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="kicker text-[var(--ink-subtle)]">Hospedagem</span>
                  <textarea
                    value={tripBrief.stayPreference}
                    onChange={(event) =>
                      setTripBrief((current) => ({
                        ...current,
                        stayPreference: event.target.value,
                      }))
                    }
                    className="field-input min-h-[110px] resize-y py-3"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="kicker text-[var(--ink-subtle)]">Prioridades</span>
                  <textarea
                    value={tripBrief.priorities}
                    onChange={(event) =>
                      setTripBrief((current) => ({
                        ...current,
                        priorities: event.target.value,
                      }))
                    }
                    className="field-input min-h-[110px] resize-y py-3"
                  />
                </label>

                <button
                  type="button"
                  onClick={startTripWorkflow}
                  disabled={!selectedBrazilOffer || !selectedOverseasOffer || trip.status === "running"}
                  className={`action-pill action-pill-primary w-full justify-center ${
                    !selectedBrazilOffer || !selectedOverseasOffer || trip.status === "running"
                      ? "opacity-60"
                      : ""
                  }`}
                >
                  {trip.status === "running"
                    ? "Calculando viagem..."
                    : "Buscar melhor viagem"}
                </button>
              </div>
            </article>

            {selectedOverseasOffer ? (
              <article className="panel-soft rounded-[1.8rem] p-5">
                <p className="kicker text-[var(--brand-300)]">Destino ativo</p>
                <h3 className="mt-3 text-2xl font-semibold text-[var(--ink-0)]">
                  {selectedOverseasOffer.city}, {selectedOverseasOffer.country}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--ink-muted)]">
                  Produto em {selectedOverseasOffer.storeName} por{" "}
                  {money.format(selectedOverseasOffer.estimatedPriceBRL)}.
                </p>
              </article>
            ) : null}

            {trip.steps.length > 0 ? (
              <WorkflowRail
                title="Workflow ao vivo"
                description="Passagens, hospedagem e custo total atualizados por etapa."
                steps={trip.steps}
              />
            ) : null}

            {trip.error ? (
              <article className="rounded-[1.6rem] border border-[var(--bad)]/35 bg-[var(--bad-soft)] p-4 text-sm leading-6 text-[var(--ink-0)]">
                {trip.error}
              </article>
            ) : null}
          </aside>

          <div className="space-y-5">
            {tripResult ? (
              <>
                <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <p className="kicker text-[var(--brand-300)]">Conta final</p>
                      <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                        {tripResult.summary}
                      </h2>
                      <p className="mt-4 text-sm leading-7 text-[var(--ink-muted)]">
                        {tripResult.recommendation}
                      </p>
                    </div>
                    <div className="rounded-[1.4rem] border border-white/8 bg-black/20 px-4 py-4">
                      <p className="kicker text-[var(--ink-subtle)]">Viagem + produto</p>
                      <p className="mt-2 font-display text-4xl text-[var(--ink-0)]">
                        {money.format(tripResult.estimatedTripSpendBRL)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-4">
                    <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
                      <p className="kicker text-[var(--ink-subtle)]">Brasil</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ink-0)]">
                        {selectedBrazilOffer ? money.format(selectedBrazilOffer.price) : "--"}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
                      <p className="kicker text-[var(--ink-subtle)]">Produto fora</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ink-0)]">
                        {money.format(tripResult.productPriceBRL)}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
                      <p className="kicker text-[var(--ink-subtle)]">Trip spend</p>
                      <p className="mt-2 text-2xl font-semibold text-[var(--ink-0)]">
                        {money.format(tripResult.estimatedTripSpendBRL)}
                      </p>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
                      <p className="kicker text-[var(--ink-subtle)]">Ganho/perda</p>
                      <p
                        className={`mt-2 text-2xl font-semibold ${
                          tripResult.estimatedSavingsVsBrazilBRL >= 0
                            ? "text-[var(--brand-300)]"
                            : "text-[var(--bad)]"
                        }`}
                      >
                        {money.format(tripResult.estimatedSavingsVsBrazilBRL)}
                      </p>
                    </div>
                  </div>

                  {tripResult.warnings.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {tripResult.warnings.map((warning) => (
                        <span key={warning} className="meta-pill">
                          {warning}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>

                <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="kicker text-[var(--brand-300)]">Passagens</p>
                      <h3 className="mt-2 font-display text-3xl text-[var(--ink-0)]">
                        Janelas de voo pesquisadas
                      </h3>
                    </div>
                    <span className="code-chip">{tripResult.ticketOptions.length} opcoes</span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {tripResult.ticketOptions.map((option) => (
                      <TicketCard
                        key={option.id}
                        option={option}
                        selected={option.id === tripResult.bestTicketId}
                      />
                    ))}
                  </div>
                </article>

                <article className="panel-soft rounded-[1.9rem] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="kicker text-[var(--brand-300)]">Hospedagem</p>
                      <h3 className="mt-2 font-display text-3xl text-[var(--ink-0)]">
                        Bases de estadia para a melhor janela
                      </h3>
                    </div>
                    <span className="code-chip">{tripResult.lodgingOptions.length} opcoes</span>
                  </div>

                  <div className="mt-5 space-y-4">
                    {tripResult.lodgingOptions.map((option) => (
                      <LodgingCard
                        key={option.id}
                        option={option}
                        selected={option.id === tripResult.bestLodgingId}
                      />
                    ))}
                  </div>
                </article>
              </>
            ) : (
              <article className="panel-soft rounded-[1.9rem] border border-dashed border-white/12 p-8">
                <p className="kicker text-[var(--brand-300)]">Esperando destino</p>
                <h2 className="mt-3 font-display text-4xl text-[var(--ink-0)]">
                  O workflow pesado entra so depois da oferta internacional.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--ink-muted)]">
                  Esse bloco vai montar janelas de passagem, bases de hospedagem
                  e o custo total da operacao. Se o numero final ficar pior do
                  que o Brasil, a interface deixa isso explicito.
                </p>
              </article>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
