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
  return region === "united_states" ? "EUA" : "Europa";
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : shortDate.format(parsed);
}

function formatWindow(option: TicketResearchOption) {
  return `${formatDate(option.departureWindow.start)} – ${formatDate(option.departureWindow.end)} / volta ${formatDate(option.returnWindow.start)} – ${formatDate(option.returnWindow.end)}`;
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

// ── UI Components ──────────────────────────────────────────────────────────

function StepBadge({
  n,
  status,
}: {
  n: number;
  status: "active" | "done" | "idle";
}) {
  return (
    <div
      className={`step-num ${
        status === "done"
          ? "step-num-done"
          : status === "active"
            ? "step-num-active"
            : "step-num-idle"
      }`}
    >
      {status === "done" ? "✓" : n}
    </div>
  );
}

function InlineWorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="mt-4 space-y-2">
      {steps.map((step) => (
        <div key={step.stepId} className="workflow-step-row">
          <span className={`status-pill shrink-0 ${stepTone(step.status)}`}>
            {step.status}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--ink-0)]">
              {step.label}
            </p>
            {step.message && (
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">
                {step.message}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SourcePills({
  sources,
}: {
  sources: { label: string; url: string; note: string }[];
}) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
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
      onClick={onSelect}
      className={`offer-card ${selected ? "offer-card-selected" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="kicker text-[var(--ink-subtle)]">{offer.storeName}</p>
        {selected && (
          <span className="status-pill tone-active">selecionado</span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-[var(--ink-0)]">
        {offer.title}
      </p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-2xl leading-none text-[var(--ink-0)]">
          {money.format(offer.price)}
        </p>
        <a
          href={offer.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-[var(--brand-300)] underline-offset-2 hover:underline"
        >
          ver oferta ↗
        </a>
      </div>
      {(offer.installments || offer.shipping) && (
        <p className="mt-1.5 text-xs text-[var(--ink-subtle)]">
          {[offer.installments, offer.shipping].filter(Boolean).join(" · ")}
        </p>
      )}
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
  const confidenceTone =
    offer.confidence === "high"
      ? "completed"
      : offer.confidence === "medium"
        ? "running"
        : "pending";

  return (
    <article
      onClick={onSelect}
      className={`offer-card ${selected ? "offer-card-selected" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="kicker text-[var(--brand-300)]">
          {regionLabel(offer.region)} · {offer.city}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {selected && (
            <span className="status-pill tone-active">selecionado</span>
          )}
          <span className={`status-pill ${stepTone(confidenceTone)}`}>
            {offer.confidence}
          </span>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-[var(--ink-0)]">
        {offer.offerTitle}
      </p>
      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
        {offer.storeName}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="metric-box">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Local
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-0)]">
            {offer.priceLocalDisplay}
          </p>
        </div>
        <div className="metric-box">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Em BRL
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-0)]">
            {money.format(offer.estimatedPriceBRL)}
          </p>
        </div>
        <div className="metric-box">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
            Economia
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--brand-300)]">
            {money.format(offer.estimatedSavingsVsBrazilBRL)}
          </p>
        </div>
      </div>

      {offer.whyItWins && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
          {offer.whyItWins}
        </p>
      )}

      {offer.caveats.length > 0 && (
        <p className="mt-1.5 text-xs text-[var(--ink-subtle)]">
          {offer.caveats.join(" · ")}
        </p>
      )}
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
  const confidenceTone =
    option.confidence === "high"
      ? "completed"
      : option.confidence === "medium"
        ? "running"
        : "pending";

  return (
    <article className={`offer-card ${selected ? "offer-card-selected" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker text-[var(--brand-300)]">
            {selected ? "Melhor janela" : "Alternativa"}
          </p>
          <p className="mt-1.5 line-clamp-2 text-sm font-semibold text-[var(--ink-0)]">
            {option.title}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`status-pill ${stepTone(confidenceTone)}`}>
            {option.confidence}
          </span>
          <p className="mt-2 font-display text-2xl leading-none text-[var(--ink-0)]">
            {option.displayPrice}
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        {formatWindow(option)}
      </p>

      {option.whyItWins && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
          {option.whyItWins}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {option.typicalCarriers.map((c) => (
          <span key={c} className="meta-pill">
            {c}
          </span>
        ))}
        {option.bookingChannels.map((c) => (
          <span key={c} className="meta-pill meta-pill-brand">
            {c}
          </span>
        ))}
      </div>

      {option.tradeoffs.length > 0 && (
        <p className="mt-2 text-xs text-[var(--ink-subtle)]">
          {option.tradeoffs.join(" · ")}
        </p>
      )}

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
  const confidenceTone =
    option.confidence === "high"
      ? "completed"
      : option.confidence === "medium"
        ? "running"
        : "pending";

  return (
    <article className={`offer-card ${selected ? "offer-card-selected" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker text-[var(--brand-300)]">
            {selected ? "Base principal" : "Alternativa"}
          </p>
          <p className="mt-1.5 text-sm font-semibold text-[var(--ink-0)]">
            {option.area}
          </p>
          <p className="text-xs text-[var(--ink-muted)]">
            {option.propertyStyle}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`status-pill ${stepTone(confidenceTone)}`}>
            {option.confidence}
          </span>
          <p className="mt-2 font-display text-2xl leading-none text-[var(--ink-0)]">
            {option.totalStayDisplay}
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {option.nightlyDisplay}/noite
          </p>
        </div>
      </div>

      {option.whyItWins && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">
          {option.whyItWins}
        </p>
      )}

      {option.bookingChannels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {option.bookingChannels.map((c) => (
            <span key={c} className="meta-pill meta-pill-brand">
              {c}
            </span>
          ))}
        </div>
      )}

      <SourcePills sources={option.sources} />
    </article>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

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

  const step2Status =
    overseas.status === "ready"
      ? "done"
      : hasSearchResults
        ? "active"
        : "idle";

  const step3Status =
    trip.status === "ready"
      ? "done"
      : overseas.status === "ready"
        ? "active"
        : "idle";

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div className="page-glow page-glow-top" />
      <div className="page-glow page-glow-side" />
      <div className="page-grid" />

      <div className="relative mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6">

        {/* ── Header ── */}
        <header className="mb-10 text-center">
          <p className="kicker text-[var(--brand-400)]">Price Trip</p>
          <h1 className="mt-2 font-display text-4xl text-[var(--ink-0)] sm:text-5xl">
            Vale a viagem?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--ink-muted)]">
            Compare o produto no Brasil, pesquise no exterior, e calcule se a viagem fecha a conta.
          </p>
        </header>

        {/* ── Step progress nav ── */}
        <nav className="mb-8 flex items-center gap-2">
          <StepBadge n={1} status={hasSearchResults ? "done" : "active"} />
          <span
            className={`text-sm font-medium ${hasSearchResults ? "text-[var(--ink-0)]" : "text-[var(--ink-muted)]"}`}
          >
            Brasil
          </span>
          <div
            className={`h-px flex-1 transition-colors ${hasSearchResults ? "bg-[var(--brand-500)]" : "bg-[var(--line)]"}`}
          />
          <StepBadge n={2} status={step2Status} />
          <span
            className={`text-sm font-medium ${hasSearchResults ? "text-[var(--ink-0)]" : "text-[var(--ink-subtle)]"}`}
          >
            Exterior
          </span>
          <div
            className={`h-px flex-1 transition-colors ${overseas.status === "ready" ? "bg-[var(--brand-500)]" : "bg-[var(--line)]"}`}
          />
          <StepBadge n={3} status={step3Status} />
          <span
            className={`text-sm font-medium ${overseas.status === "ready" ? "text-[var(--ink-0)]" : "text-[var(--ink-subtle)]"}`}
          >
            Viagem
          </span>
        </nav>

        <div className="space-y-5">

          {/* ── STEP 1: Brazil search ── */}
          <section className="step-panel">
            <div className="mb-5 flex items-center gap-3">
              <StepBadge n={1} status={hasSearchResults ? "done" : "active"} />
              <h2 className="font-display text-2xl text-[var(--ink-0)]">
                Busca no Brasil
              </h2>
              {search.status === "loading" && (
                <span className="ml-auto status-pill tone-active">
                  Buscando...
                </span>
              )}
            </div>

            {/* Search input */}
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite o produto, ex: iphone 15"
              className="search-input"
            />

            {/* Sample query chips */}
            <div className="mt-3 flex flex-wrap gap-2">
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

            {/* Status line */}
            <div className="mt-3 min-h-5 text-sm text-[var(--ink-muted)]">
              {search.status === "error"
                ? search.error
                : hasSearchResults
                  ? `${search.results?.offers.length} ofertas encontradas`
                  : query.trim().length >= 3 && search.status !== "loading"
                    ? "Nenhuma oferta encontrada."
                    : query.trim().length > 0 && query.trim().length < 3
                      ? "Continue digitando…"
                      : ""}
            </div>

            {/* Provider health pills — compact */}
            {search.results && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {search.results.providers.map((p) => (
                  <span
                    key={p.storeKey}
                    className={`status-pill ${providerTone(p.status)}`}
                  >
                    {p.storeName} · {statusLabel(p.status)}
                    {p.status === "ok" ? ` (${p.offers.length})` : ""}
                  </span>
                ))}
              </div>
            )}

            {/* Offer grid */}
            {hasSearchResults && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {search.results?.offers.map((offer) => (
                  <SearchOfferCard
                    key={offerKey(offer)}
                    offer={offer}
                    selected={offerKey(offer) === selectedBrazilOfferId}
                    onSelect={() => setSelectedBrazilOfferId(offerKey(offer))}
                  />
                ))}
              </div>
            )}

            {/* CTA to step 2 */}
            {hasSearchResults && selectedBrazilOffer && (
              <div className="step-cta">
                <div>
                  <p className="text-xs text-[var(--ink-subtle)]">
                    Oferta base
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--ink-0)]">
                    <span className="font-medium">{selectedBrazilOffer.storeName}</span>
                    {" · "}
                    <span className="font-display text-lg">
                      {brazilBestPrice !== null ? money.format(brazilBestPrice) : "—"}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startOverseasWorkflow}
                  disabled={overseas.status === "running"}
                  className={`action-pill action-pill-primary ${overseas.status === "running" ? "opacity-60" : ""}`}
                >
                  {overseas.status === "running"
                    ? "Pesquisando…"
                    : "Pesquisar fora do Brasil →"}
                </button>
              </div>
            )}
          </section>

          {/* ── STEP 2: Overseas research ── */}
          <section
            className={`step-panel ${!hasSearchResults ? "step-panel-locked" : ""}`}
          >
            <div className="mb-5 flex items-center gap-3">
              <StepBadge n={2} status={step2Status} />
              <h2 className="font-display text-2xl text-[var(--ink-0)]">
                Pesquisa Internacional
              </h2>
              {overseas.status === "running" && (
                <span className="ml-auto status-pill tone-active">
                  Pesquisando…
                </span>
              )}
            </div>

            {/* Idle nudge */}
            {overseas.status === "idle" && hasSearchResults && (
              <p className="text-sm text-[var(--ink-muted)]">
                Selecione uma oferta e clique em{" "}
                <strong className="text-[var(--ink-0)]">
                  Pesquisar fora do Brasil
                </strong>{" "}
                acima.
              </p>
            )}

            {/* Workflow steps inline */}
            {overseas.steps.length > 0 && (
              <InlineWorkflowSteps steps={overseas.steps} />
            )}

            {/* Error */}
            {overseas.error && (
              <p className="mt-3 rounded-lg border border-[var(--bad)]/30 bg-[var(--bad-soft)] p-3 text-sm text-[var(--ink-0)]">
                {overseas.error}
              </p>
            )}

            {/* Results */}
            {overseas.result && (
              <>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-lg text-sm leading-6 text-[var(--ink-muted)]">
                    {overseas.result.summary}
                  </p>
                  <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-right">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
                      Referência BR
                    </p>
                    <p className="mt-0.5 font-display text-xl text-[var(--ink-0)]">
                      {money.format(overseas.result.brazilReferencePriceBRL)}
                    </p>
                  </div>
                </div>

                {overseas.result.warnings.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {overseas.result.warnings.map((w) => (
                      <span key={w} className="meta-pill">
                        {w}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {overseas.result.offers.map((offer) => (
                    <OverseasOfferCard
                      key={offer.id}
                      offer={offer}
                      selected={offer.id === selectedOverseasOfferId}
                      onSelect={() => setSelectedOverseasOfferId(offer.id)}
                    />
                  ))}
                </div>

                {selectedOverseasOffer && (
                  <div className="step-cta">
                    <div>
                      <p className="text-xs text-[var(--ink-subtle)]">
                        Destino selecionado
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-[var(--ink-0)]">
                        {selectedOverseasOffer.city},{" "}
                        {selectedOverseasOffer.country}
                        {" · "}
                        <span className="font-display text-lg">
                          {money.format(selectedOverseasOffer.estimatedPriceBRL)}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-[var(--brand-300)]">
                      ↓ Configure a viagem abaixo
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── STEP 3: Trip planning ── */}
          <section
            className={`step-panel ${!overseas.result ? "step-panel-locked" : ""}`}
          >
            <div className="mb-5 flex items-center gap-3">
              <StepBadge n={3} status={step3Status} />
              <h2 className="font-display text-2xl text-[var(--ink-0)]">
                Planejar a Viagem
              </h2>
              {trip.status === "running" && (
                <span className="ml-auto status-pill tone-active">
                  Calculando…
                </span>
              )}
            </div>

            {/* Active destination banner */}
            {selectedOverseasOffer && (
              <div className="mb-5 rounded-lg border border-[var(--brand-600)]/30 bg-[var(--active-soft)] px-4 py-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--brand-300)]">
                  Destino ativo
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--ink-0)]">
                  {selectedOverseasOffer.city}, {selectedOverseasOffer.country}
                  {" · "}
                  {selectedOverseasOffer.storeName}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
                  Produto por{" "}
                  {money.format(selectedOverseasOffer.estimatedPriceBRL)} em BRL
                </p>
              </div>
            )}

            {/* Trip brief form */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="kicker text-[var(--ink-subtle)]">Origem</span>
                <input
                  value={tripBrief.origin}
                  onChange={(e) =>
                    setTripBrief((c) => ({ ...c, origin: e.target.value }))
                  }
                  className="field-input mt-1.5"
                />
              </label>

              <label className="block">
                <span className="kicker text-[var(--ink-subtle)]">
                  Viajantes
                </span>
                <input
                  value={tripBrief.travelers}
                  onChange={(e) =>
                    setTripBrief((c) => ({ ...c, travelers: e.target.value }))
                  }
                  className="field-input mt-1.5"
                />
              </label>

              <label className="block">
                <span className="kicker text-[var(--ink-subtle)]">Noites</span>
                <input
                  type="number"
                  min={2}
                  max={7}
                  value={tripBrief.tripLengthNights}
                  onChange={(e) =>
                    setTripBrief((c) => ({
                      ...c,
                      tripLengthNights: e.target.value,
                    }))
                  }
                  className="field-input mt-1.5"
                />
              </label>

              <label className="block">
                <span className="kicker text-[var(--ink-subtle)]">
                  Hospedagem
                </span>
                <textarea
                  value={tripBrief.stayPreference}
                  onChange={(e) =>
                    setTripBrief((c) => ({
                      ...c,
                      stayPreference: e.target.value,
                    }))
                  }
                  className="field-input mt-1.5 min-h-[80px] resize-y py-2.5"
                />
              </label>

              <label className="block">
                <span className="kicker text-[var(--ink-subtle)]">
                  Prioridades
                </span>
                <textarea
                  value={tripBrief.priorities}
                  onChange={(e) =>
                    setTripBrief((c) => ({
                      ...c,
                      priorities: e.target.value,
                    }))
                  }
                  className="field-input mt-1.5 min-h-[80px] resize-y py-2.5"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={startTripWorkflow}
              disabled={
                !selectedBrazilOffer ||
                !selectedOverseasOffer ||
                trip.status === "running"
              }
              className={`action-pill action-pill-primary mt-5 w-full justify-center ${
                !selectedBrazilOffer ||
                !selectedOverseasOffer ||
                trip.status === "running"
                  ? "opacity-60"
                  : ""
              }`}
            >
              {trip.status === "running"
                ? "Calculando…"
                : "Calcular viagem completa →"}
            </button>

            {/* Workflow steps inline */}
            {trip.steps.length > 0 && (
              <InlineWorkflowSteps steps={trip.steps} />
            )}

            {/* Error */}
            {trip.error && (
              <p className="mt-3 rounded-lg border border-[var(--bad)]/30 bg-[var(--bad-soft)] p-3 text-sm text-[var(--ink-0)]">
                {trip.error}
              </p>
            )}

            {/* ── Trip results ── */}
            {tripResult && (
              <>
                {/* Final comparison scorecard */}
                <div className="result-panel mt-6">
                  <p className="kicker text-[var(--brand-300)]">Conta final</p>
                  <h3 className="mt-2 font-display text-3xl text-[var(--ink-0)]">
                    {tripResult.summary}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">
                    {tripResult.recommendation}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="metric-box">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        Brasil
                      </p>
                      <p className="mt-1.5 text-xl font-semibold text-[var(--ink-0)]">
                        {selectedBrazilOffer
                          ? money.format(selectedBrazilOffer.price)
                          : "—"}
                      </p>
                    </div>
                    <div className="metric-box">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        Produto fora
                      </p>
                      <p className="mt-1.5 text-xl font-semibold text-[var(--ink-0)]">
                        {money.format(tripResult.productPriceBRL)}
                      </p>
                    </div>
                    <div className="metric-box">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        Viagem total
                      </p>
                      <p className="mt-1.5 text-xl font-semibold text-[var(--ink-0)]">
                        {money.format(tripResult.estimatedTripSpendBRL)}
                      </p>
                    </div>
                    <div className="metric-box">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">
                        Ganho/perda
                      </p>
                      <p
                        className={`mt-1.5 text-xl font-semibold ${
                          tripResult.estimatedSavingsVsBrazilBRL >= 0
                            ? "text-[var(--good)]"
                            : "text-[var(--bad)]"
                        }`}
                      >
                        {money.format(tripResult.estimatedSavingsVsBrazilBRL)}
                      </p>
                    </div>
                  </div>

                  {tripResult.warnings.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {tripResult.warnings.map((w) => (
                        <span key={w} className="meta-pill">
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ticket options */}
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="kicker text-[var(--brand-300)]">Passagens</p>
                    <span className="code-chip">
                      {tripResult.ticketOptions.length} opções
                    </span>
                  </div>
                  <div className="space-y-3">
                    {tripResult.ticketOptions.map((option) => (
                      <TicketCard
                        key={option.id}
                        option={option}
                        selected={option.id === tripResult.bestTicketId}
                      />
                    ))}
                  </div>
                </div>

                {/* Lodging options */}
                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="kicker text-[var(--brand-300)]">
                      Hospedagem
                    </p>
                    <span className="code-chip">
                      {tripResult.lodgingOptions.length} opções
                    </span>
                  </div>
                  <div className="space-y-3">
                    {tripResult.lodgingOptions.map((option) => (
                      <LodgingCard
                        key={option.id}
                        option={option}
                        selected={option.id === tripResult.bestLodgingId}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-12 pb-6 text-center">
          <p className="text-xs text-[var(--ink-subtle)]">
            Price Trip · hackathon
          </p>
        </footer>
      </div>
    </main>
  );
}
