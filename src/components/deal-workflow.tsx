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

type HistoryEntry = {
  id: string;
  savedAt: number;
  query: string;
  destinationCity: string;
  destinationCountry: string;
  savingsBRL: number;
  hasTripResult: boolean;
  currentStep: 1 | 2 | 3;
  search: { status: "idle" | "loading" | "ready" | "error"; error: string; results: SearchResponse | null };
  selectedBrazilOfferId: string;
  selectedOverseasOfferId: string;
  tripBrief: TripBrief;
  overseas: AsyncWorkflowState<OverseasResearchResponse>;
  trip: AsyncWorkflowState<TripPlanResponse>;
  selectedTicketId: string;
  selectedLodgingId: string;
};

const HISTORY_KEY = "price-trip:history";
const MAX_HISTORY = 20;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch { return []; }
}

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

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
  return { status: "idle", error: "", result: null, steps: [] };
}

function initialTripBrief(): TripBrief {
  return {
    origin: "São Paulo (GRU)",
    travelers: "1 adulto",
    tripLengthNights: "3",
    stayPreference: "Apartamento simples ou hotel prático perto de transporte.",
    priorities: "Maximizar economia total sem sacrificar segurança e logística.",
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
    case "ok":            return "ativo";
    case "empty":         return "sem match";
    case "not_configured":return "na fila";
    case "error":         return "bloqueado";
    default:              return "parcial";
  }
}

function providerTone(status: SearchResponse["providers"][number]["status"]) {
  switch (status) {
    case "ok":    return "tone-good";
    case "error": return "tone-bad";
    case "not_configured": return "tone-warn";
    default:      return "tone-soft";
  }
}

function stepTone(status: WorkflowStepStatus) {
  switch (status) {
    case "completed": return "tone-good";
    case "running":   return "tone-active";
    case "error":     return "tone-bad";
    default:          return "tone-soft";
  }
}

function stepStatusLabel(status: WorkflowStepStatus) {
  switch (status) {
    case "completed": return "concluído";
    case "running":   return "processando";
    case "error":     return "erro";
    default:          return "pendente";
  }
}

function confidenceLabel(confidence: "high" | "medium" | "low") {
  switch (confidence) {
    case "high":   return "alta";
    case "medium": return "média";
    case "low":    return "baixa";
  }
}

function regionLabel(region: OverseasMarketOffer["region"]) {
  switch (region) {
    case "united_states": return "EUA";
    case "europe":        return "Europa";
    case "paraguay":      return "Paraguai";
  }
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : shortDate.format(parsed);
}

function formatWindow(option: TicketResearchOption) {
  const dep = formatDate(option.departureWindow.start);
  const ret = formatDate(option.returnWindow.end);
  return `${dep} → ${ret} · ${option.tripLengthNights}n`;
}

function mergeStep(
  steps: WorkflowStep[],
  incoming: Pick<WorkflowStep, "stepId" | "label" | "status" | "message">,
) {
  const index = steps.findIndex((s) => s.stepId === incoming.stepId);
  if (index === -1) return [...steps, incoming];
  const copy = [...steps];
  copy[index] = { ...copy[index], ...incoming };
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
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflow, ...payload }),
    signal,
  });

  if (!response.ok || !response.body) {
    const fallback = await response.json().catch(() => null);
    throw new Error(fallback?.error ?? `Não foi possível iniciar o workflow ${workflow}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamError = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n")) {
      const newlineIndex = buffer.indexOf("\n");
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;

      const event = JSON.parse(line) as WorkflowEvent;
      if (event.type === "step.updated") { onStep(event); continue; }
      if (event.type === "result" && event.workflow === workflow) { onResult(event.data as T); continue; }
      if (event.type === "error" && event.workflow === workflow) { streamError = event.message; }
    }
  }

  if (streamError) throw new Error(streamError);
}

// ── UI sub-components ──────────────────────────────────────────────────────

function StepBadge({ n, status }: { n: number; status: "active" | "done" | "idle" }) {
  return (
    <div className={`step-num ${
      status === "done" ? "step-num-done" :
      status === "active" ? "step-num-active" :
      "step-num-idle"
    }`}>
      {status === "done" ? "✓" : n}
    </div>
  );
}

function InlineWorkflowSteps({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="mt-4 space-y-2">
      {steps.map((step) => (
        <div key={step.stepId} className="workflow-step-row">
          <span className={`status-pill shrink-0 ${stepTone(step.status)}`}>{stepStatusLabel(step.status)}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--ink-0)]">{step.label}</p>
            {step.message && (
              <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]">{step.message}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SourcePills({ sources }: { sources: { label: string; url: string; note: string }[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <a key={`${s.label}-${s.url}`} href={s.url} target="_blank" rel="noreferrer"
          className="action-pill" title={s.note}>
          {s.label}
        </a>
      ))}
    </div>
  );
}

function SearchOfferCard({ offer, selected, onSelect }: {
  offer: SearchOffer; selected: boolean; onSelect: () => void;
}) {
  return (
    <article onClick={onSelect} className={`offer-card ${selected ? "offer-card-selected" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="kicker text-[var(--ink-subtle)]">{offer.storeName}</p>
        {selected && <span className="status-pill tone-active">selecionado</span>}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-[var(--ink-0)]">
        {offer.title}
      </p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-2xl leading-none text-[var(--ink-0)]">
          {money.format(offer.price)}
        </p>
        <a href={offer.url} target="_blank" rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-[var(--brand-600)] underline-offset-2 hover:underline">
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

function OverseasOfferCard({ offer, brazilReferencePriceBRL, selected, onSelect }: {
  offer: OverseasMarketOffer; brazilReferencePriceBRL: number; selected: boolean; onSelect: () => void;
}) {
  const confidenceTone =
    offer.confidence === "high" ? "completed" :
    offer.confidence === "medium" ? "running" : "pending";

  const savings = brazilReferencePriceBRL - offer.estimatedPriceBRL;

  return (
    <article onClick={onSelect} className={`offer-card ${selected ? "offer-card-selected" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="kicker text-[var(--brand-600)]">
          {regionLabel(offer.region)} · {offer.city}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {selected && <span className="status-pill tone-active">selecionado</span>}
          <span className={`status-pill ${stepTone(confidenceTone)}`}>{confidenceLabel(offer.confidence)}</span>
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-[var(--ink-0)]">
        {offer.offerTitle}
      </p>
      <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{offer.storeName}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="metric-box">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">Brasil</p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-0)]">{money.format(brazilReferencePriceBRL)}</p>
        </div>
        <div className="metric-box">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">Exterior ({offer.priceLocalDisplay})</p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-0)]">{money.format(offer.estimatedPriceBRL)}</p>
        </div>
        <div className="metric-box">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">Economia</p>
          <p className={`mt-1 text-sm font-semibold ${savings > 0 ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
            {money.format(savings)}
          </p>
        </div>
      </div>

      {offer.whyItWins && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-5 text-[var(--ink-muted)]">{offer.whyItWins}</p>
      )}
      {offer.caveats.length > 0 && (
        <p className="mt-1.5 text-xs text-[var(--ink-subtle)]">{offer.caveats.join(" · ")}</p>
      )}
      {offer.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {offer.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer"
              className="action-pill text-[var(--brand-600)] hover:bg-[var(--brand-50)]">
              {s.label} ↗
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

function TicketCard({ option, selected, onSelect }: {
  option: TicketResearchOption; selected: boolean; onSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const confidenceTone =
    option.confidence === "high" ? "completed" :
    option.confidence === "medium" ? "running" : "pending";

  return (
    <article className={`offer-card ${selected ? "offer-card-selected" : ""}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <p className="kicker text-[var(--brand-600)]">{selected ? "Melhor janela" : "Alternativa"}</p>
        <p className="mt-1.5 text-base font-semibold leading-snug text-[var(--ink-0)]">{option.title}</p>
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{formatWindow(option)}</p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-subtle)]">{option.displayPrice}</p>
      </button>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="font-display text-3xl text-[var(--ink-0)]">
          {money.format(option.estimatedRoundTripBRL)}
        </p>
        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            className={`action-pill text-[11px] ${selected ? "action-pill-primary" : ""}`}
          >
            {selected ? "✓ selecionado" : "selecionar"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 border-t border-[var(--line)] pt-3 space-y-2">
          <span className={`status-pill ${stepTone(confidenceTone)}`}>{confidenceLabel(option.confidence)}</span>
          {option.whyItWins && (
            <p className="text-xs leading-5 text-[var(--ink-muted)]">{option.whyItWins}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {option.typicalCarriers.map((c) => <span key={c} className="meta-pill">{c}</span>)}
            {option.bookingChannels.map((c) => <span key={c} className="meta-pill meta-pill-brand">{c}</span>)}
          </div>
          {option.tradeoffs.length > 0 && (
            <p className="text-xs text-[var(--ink-subtle)]">{option.tradeoffs.join(" · ")}</p>
          )}
          <SourcePills sources={option.sources} />
        </div>
      )}
    </article>
  );
}

function LodgingCard({ option, selected, onSelect }: {
  option: TripPlanResponse["lodgingOptions"][number]; selected: boolean; onSelect?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const confidenceTone =
    option.confidence === "high" ? "completed" :
    option.confidence === "medium" ? "running" : "pending";

  return (
    <article className={`offer-card ${selected ? "offer-card-selected" : ""}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <p className="kicker text-[var(--brand-600)]">{selected ? "Base principal" : "Alternativa"}</p>
        <p className="mt-1.5 text-base font-semibold leading-snug text-[var(--ink-0)]">{option.area}</p>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{option.propertyStyle} · {option.nightlyDisplay}</p>
      </button>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-3xl text-[var(--ink-0)]">
            {money.format(option.estimatedTotalStayBRL)}
          </p>
          <p className="text-[10px] text-[var(--ink-subtle)]">total da estadia</p>
        </div>
        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            className={`action-pill text-[11px] ${selected ? "action-pill-primary" : ""}`}
          >
            {selected ? "✓ selecionado" : "selecionar"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 border-t border-[var(--line)] pt-3 space-y-2">
          <span className={`status-pill ${stepTone(confidenceTone)}`}>{confidenceLabel(option.confidence)}</span>
          {option.whyItWins && (
            <p className="text-xs leading-5 text-[var(--ink-muted)]">{option.whyItWins}</p>
          )}
          {option.accessNotes && (
            <p className="text-xs text-[var(--ink-subtle)]">{option.accessNotes}</p>
          )}
          {option.bookingChannels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {option.bookingChannels.map((c) => <span key={c} className="meta-pill meta-pill-brand">{c}</span>)}
            </div>
          )}
          <SourcePills sources={option.sources} />
        </div>
      )}
    </article>
  );
}

function AgentLogs({ steps, summary, warnings }: {
  steps: WorkflowStep[];
  summary?: string;
  warnings?: string[];
}) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return null;
  return (
    <div className="mt-4 border-t border-[var(--line)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]"
      >
        <span className="font-mono uppercase tracking-wider">Logs do agente</span>
        <span className="font-mono">({steps.length} etapas)</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <InlineWorkflowSteps steps={steps} />
          {summary && (
            <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">{summary}</p>
          )}
          {warnings && warnings.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {warnings.map((w) => <span key={w} className="meta-pill">{w}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Scorecard({ brazilPrice, productPriceBRL, tripSpendBRL, savingsBRL, recommendation, warnings }: {
  brazilPrice: number | null;
  productPriceBRL: number;
  tripSpendBRL: number;
  savingsBRL: number;
  recommendation: string;
  warnings: string[];
}) {
  const [warningsOpen, setWarningsOpen] = useState(false);
  const positive = savingsBRL >= 0;

  return (
    <div className="result-panel mt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="kicker text-[var(--brand-600)]">Conta final</p>
        {warnings.length > 0 && (
          <button
            type="button"
            onClick={() => setWarningsOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-3)] px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--ink-muted)] hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
          >
            ⚠ {warnings.length} avisos {warningsOpen ? "▲" : "▼"}
          </button>
        )}
      </div>

      {warningsOpen && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-3)] p-3">
          {warnings.map((w) => (
            <p key={w} className="text-xs leading-5 text-[var(--ink-muted)]">· {w}</p>
          ))}
        </div>
      )}

      <p className="mt-2 text-sm leading-6 text-[var(--ink-muted)]">{recommendation}</p>

      {/* Top row: main comparison */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {/* Brasil — muted baseline */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">Comprar no Brasil</p>
          <p className="mt-2 font-display text-2xl text-[var(--ink-0)]">
            {brazilPrice !== null ? money.format(brazilPrice) : "—"}
          </p>
        </div>

        {/* Viagem total — prominent */}
        <div className="rounded-xl border-2 border-[var(--brand-200)] bg-white p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--brand-600)]">Viagem completa</p>
          <p className="mt-2 font-display text-2xl text-[var(--ink-0)]">{money.format(tripSpendBRL)}</p>
          <p className="mt-1 text-[10px] text-[var(--ink-subtle)]">produto + passagem + hotel</p>
        </div>
      </div>

      {/* Bottom row: hero savings + product breakdown */}
      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
        {/* Produto fora — small detail */}
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-subtle)]">Produto fora</p>
          <p className="mt-2 text-base font-semibold text-[var(--ink-0)]">{money.format(productPriceBRL)}</p>
        </div>

        {/* Ganho/perda — hero, spans 2 cols */}
        <div className={`col-span-2 rounded-xl border-2 p-3 ${
          positive
            ? "border-[#A7F3D0] bg-[var(--good-soft)]"
            : "border-[#FECACA] bg-[var(--bad-soft)]"
        }`}>
          <p className={`text-[10px] font-mono uppercase tracking-wider ${positive ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
            {positive ? "Você economiza" : "Você paga a mais"}
          </p>
          <p className={`mt-2 font-display text-3xl font-bold ${positive ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
            {money.format(Math.abs(savingsBRL))}
          </p>
          <p className={`mt-1 text-[10px] ${positive ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
            vs. comprar no Brasil
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function DealWorkflow() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [search, setSearch] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    error: string;
    results: SearchResponse | null;
  }>({ status: "idle", error: "", results: null });
  const [selectedBrazilOfferId, setSelectedBrazilOfferId] = useState("");
  const [searchSourcesOpen, setSearchSourcesOpen] = useState(false);
  const [selectedOverseasOfferId, setSelectedOverseasOfferId] = useState("");
  const [tripBrief, setTripBrief] = useState<TripBrief>(initialTripBrief);
  const [overseas, setOverseas] = useState<AsyncWorkflowState<OverseasResearchResponse>>(() => emptyWorkflow());
  const [trip, setTrip] = useState<AsyncWorkflowState<TripPlanResponse>>(() => emptyWorkflow());
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [selectedLodgingId, setSelectedLodgingId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    return loadHistory();
  });
  const restoringRef = useRef(false);
  const searchAbortRef   = useRef<AbortController | null>(null);
  const overseasAbortRef = useRef<AbortController | null>(null);
  const tripAbortRef     = useRef<AbortController | null>(null);

  const selectedBrazilOffer = useMemo(() => {
    if (!search.results) return null;
    return (
      search.results.offers.find((o) => offerKey(o) === selectedBrazilOfferId) ??
      search.results.offers[0] ?? null
    );
  }, [search.results, selectedBrazilOfferId]);

  const selectedOverseasOffer = useMemo(() => {
    const offers = overseas.result?.offers;
    if (!offers?.length) return null;
    return (
      offers.find((o) => overseasOfferKey(o) === selectedOverseasOfferId) ??
      offers.find((o) => o.id === overseas.result?.recommendedOfferId) ??
      offers[0] ?? null
    );
  }, [overseas.result, selectedOverseasOfferId]);

  useEffect(() => {
    const normalized = deferredQuery.trim();
    if (normalized.length < 3) {
      searchAbortRef.current?.abort();
      setSearch({ status: normalized.length === 0 ? "idle" : "ready", error: "", results: null });
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;

    const timeout = window.setTimeout(() => {
      setSearch((c) => ({ ...c, status: "loading", error: "" }));

      void fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            const p = await res.json().catch(() => null);
            throw new Error(p?.error ?? "Não foi possível buscar o produto agora.");
          }
          return res.json() as Promise<SearchResponse>;
        })
        .then((results) => {
          if (controller.signal.aborted) return;
          setSearch({ status: "ready", error: "", results });
          setSelectedBrazilOfferId((cur) =>
            results.offers.some((o) => offerKey(o) === cur)
              ? cur
              : results.offers[0] ? offerKey(results.offers[0]) : "",
          );
        })
        .catch((err: Error) => {
          if (controller.signal.aborted) return;
          setSearch({ status: "error", error: err.message, results: null });
        });
    }, 350);

    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [deferredQuery]);

  useEffect(() => {
    if (restoringRef.current) return;
    setOverseas(emptyWorkflow());
    setTrip(emptyWorkflow());
    setSelectedOverseasOfferId("");
  }, [selectedBrazilOfferId]);

  useEffect(() => {
    const result = overseas.result;
    if (!result) return;
    setSelectedOverseasOfferId((cur) =>
      result.offers.some((o) => o.id === cur) ? cur : result.recommendedOfferId,
    );
  }, [overseas.result]);

  useEffect(() => {
    if (restoringRef.current) return;
    setTrip(emptyWorkflow());
  }, [selectedOverseasOfferId]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      overseasAbortRef.current?.abort();
      tripAbortRef.current?.abort();
    };
  }, []);

  function saveHistoryEntry(entry: HistoryEntry) {
    try {
      const existing = loadHistory();
      const next = [entry, ...existing].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      setHistory(next);
    } catch { /* quota exceeded or SSR */ }
  }

  // Auto-save when overseas result arrives
  useEffect(() => {
    if (overseas.status !== "ready" || !overseas.result) return;
    const offer =
      overseas.result.offers.find((o) => o.id === selectedOverseasOfferId) ??
      overseas.result.offers.find((o) => o.id === overseas.result!.recommendedOfferId) ??
      overseas.result.offers[0];
    saveHistoryEntry({
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      query,
      destinationCity: offer?.city ?? "",
      destinationCountry: offer?.country ?? "",
      savingsBRL: offer ? (selectedBrazilOffer?.price ?? 0) - offer.estimatedPriceBRL : 0,
      hasTripResult: false,
      currentStep,
      search,
      selectedBrazilOfferId,
      selectedOverseasOfferId,
      tripBrief,
      overseas,
      trip,
      selectedTicketId,
      selectedLodgingId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overseas.status]);

  // Auto-save (update) when trip result arrives
  useEffect(() => {
    if (trip.status !== "ready" || !trip.result) return;
    const r = trip.result;
    const tk = r.ticketOptions.find((t) => t.id === selectedTicketId) ?? r.ticketOptions.find((t) => t.id === r.bestTicketId) ?? r.ticketOptions[0];
    const lg = r.lodgingOptions.find((l) => l.id === selectedLodgingId) ?? r.lodgingOptions.find((l) => l.id === r.bestLodgingId) ?? r.lodgingOptions[0];
    const spend = tk && lg ? r.productPriceBRL + tk.estimatedRoundTripBRL + lg.estimatedTotalStayBRL : r.estimatedTripSpendBRL;
    saveHistoryEntry({
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      query,
      destinationCity: r.destinationCity,
      destinationCountry: r.destinationCountry,
      savingsBRL: (selectedBrazilOffer?.price ?? r.productPriceBRL) - spend,
      hasTripResult: true,
      currentStep,
      search,
      selectedBrazilOfferId,
      selectedOverseasOfferId,
      tripBrief,
      overseas,
      trip,
      selectedTicketId,
      selectedLodgingId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.status]);

  function restoreEntry(entry: HistoryEntry) {
    restoringRef.current = true;
    setQuery(entry.query);
    setSearch(entry.search);
    setSelectedBrazilOfferId(entry.selectedBrazilOfferId);
    setSelectedOverseasOfferId(entry.selectedOverseasOfferId);
    setTripBrief(entry.tripBrief);
    setOverseas(entry.overseas);
    setTrip(entry.trip);
    setSelectedTicketId(entry.selectedTicketId);
    setSelectedLodgingId(entry.selectedLodgingId);
    setCurrentStep(entry.currentStep);
    setHistoryOpen(false);
    setTimeout(() => { restoringRef.current = false; }, 0);
  }

  function resetAll() {
    setQuery("");
    setSearch({ status: "idle", error: "", results: null });
    setSelectedBrazilOfferId("");
    setSelectedOverseasOfferId("");
    setTripBrief(initialTripBrief());
    setOverseas(emptyWorkflow());
    setTrip(emptyWorkflow());
    setSelectedTicketId("");
    setSelectedLodgingId("");
    setCurrentStep(1);
    setHistoryOpen(false);
  }

  async function startOverseasWorkflow() {
    if (!selectedBrazilOffer || overseas.status === "running") return;

    const controller = new AbortController();
    overseasAbortRef.current?.abort();
    overseasAbortRef.current = controller;

    setCurrentStep(2); // advance to overseas step
    setOverseas({ status: "running", error: "", result: null, steps: [] });

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
          setOverseas((c) => ({
            ...c,
            steps: mergeStep(c.steps, { stepId: event.stepId, label: event.label, status: event.status, message: event.message }),
          }));
        },
        onResult: (result) => {
          setOverseas((c) => ({ ...c, status: "ready", result }));
        },
      });

      setOverseas((c) => ({
        ...c,
        status: c.result ? "ready" : "error",
        error: c.result ? "" : "Nenhum resultado internacional foi retornado.",
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setOverseas((c) => ({
        ...c, status: "error",
        error: error instanceof Error ? error.message : "Não foi possível concluir a pesquisa internacional.",
      }));
    }
  }

  async function startTripWorkflow() {
    if (!selectedBrazilOffer || !selectedOverseasOffer || trip.status === "running") return;

    const controller = new AbortController();
    tripAbortRef.current?.abort();
    tripAbortRef.current = controller;

    setTrip({ status: "running", error: "", result: null, steps: [] });

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
          setTrip((c) => ({
            ...c,
            steps: mergeStep(c.steps, { stepId: event.stepId, label: event.label, status: event.status, message: event.message }),
          }));
        },
        onResult: (result) => {
          setSelectedTicketId(result.bestTicketId);
          setSelectedLodgingId(result.bestLodgingId);
          setTrip((c) => ({ ...c, status: "ready", result }));
        },
      });

      setTrip((c) => ({
        ...c,
        status: c.result ? "ready" : "error",
        error: c.result ? "" : "Não foi possível montar a viagem.",
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      setTrip((c) => ({
        ...c, status: "error",
        error: error instanceof Error ? error.message : "Não foi possível concluir a pesquisa de viagem.",
      }));
    }
  }

  const hasSearchResults  = Boolean(search.results?.offers.length);
  const brazilBestPrice   = selectedBrazilOffer?.price ?? search.results?.offers[0]?.price ?? null;
  const tripResult        = trip.result;

  // Active ticket/lodging selection — initialized from best IDs, user can override
  const activeTicket = useMemo(() => {
    if (!tripResult) return null;
    return (
      tripResult.ticketOptions.find((t) => t.id === selectedTicketId) ??
      tripResult.ticketOptions.find((t) => t.id === tripResult.bestTicketId) ??
      tripResult.ticketOptions[0] ?? null
    );
  }, [tripResult, selectedTicketId]);

  const activeLodging = useMemo(() => {
    if (!tripResult) return null;
    return (
      tripResult.lodgingOptions.find((l) => l.id === selectedLodgingId) ??
      tripResult.lodgingOptions.find((l) => l.id === tripResult.bestLodgingId) ??
      tripResult.lodgingOptions[0] ?? null
    );
  }, [tripResult, selectedLodgingId]);

  // Recalculate totals whenever the user picks a different ticket or lodging
  const activeTripSpend = useMemo(() => {
    if (!tripResult || !activeTicket || !activeLodging) return tripResult?.estimatedTripSpendBRL ?? 0;
    return tripResult.productPriceBRL + activeTicket.estimatedRoundTripBRL + activeLodging.estimatedTotalStayBRL;
  }, [tripResult, activeTicket, activeLodging]);

  const activeSavings = useMemo(() => {
    if (!tripResult) return 0;
    const brazilRef = selectedBrazilOffer?.price ?? tripResult.productPriceBRL;
    return brazilRef - activeTripSpend;
  }, [tripResult, activeTripSpend, selectedBrazilOffer]);

  const canGoTo = (step: 1 | 2 | 3): boolean => {
    if (step === 1) return true;
    if (step === 2) return hasSearchResults;
    if (step === 3) return Boolean(overseas.result);
    return false;
  };

  const stepDone = (step: 1 | 2 | 3): boolean => {
    if (step === 1) return hasSearchResults && Boolean(selectedBrazilOffer);
    if (step === 2) return overseas.status === "ready";
    if (step === 3) return trip.status === "ready";
    return false;
  };

  const NAV_STEPS = [
    { n: 1 as const, label: "Brasil" },
    { n: 2 as const, label: "Exterior" },
    { n: 3 as const, label: "Viagem" },
  ];

  return (
    <main className="flex min-h-screen flex-col" style={{ backgroundColor: "var(--surface-0)" }}>
      <div className="mx-auto w-full max-w-[860px] flex-1 px-4 py-10 sm:px-6">

        {/* ── Header ── */}
        <header className="relative mb-8 text-center">
          <p className="kicker text-[var(--brand-600)]">Price Trip</p>
          <h1 className="mt-2 font-display text-4xl text-[var(--ink-0)] sm:text-5xl">
            Vale a viagem?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--ink-muted)]">
            Compare o produto no Brasil, pesquise no exterior, e calcule se a viagem fecha a conta.
          </p>
        </header>

        {/* ── Tab step navigator ── */}
        <nav className="mb-6 flex rounded-xl border border-[var(--line)] bg-[var(--surface-3)] p-1">
          {NAV_STEPS.map(({ n, label }) => {
            const accessible = canGoTo(n);
            const done = stepDone(n);
            const active = currentStep === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => { if (accessible) setCurrentStep(n); }}
                disabled={!accessible}
                className={`step-tab ${active ? "step-tab-active" : accessible ? "step-tab-accessible" : "step-tab-locked"}`}
              >
                <StepBadge n={n} status={done ? "done" : active ? "active" : "idle"} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Step 1: Brazil search ── */}
        {currentStep === 1 && (
          <section className="step-panel">
            <div className="mb-5 flex items-center gap-3">
              <StepBadge n={1} status={stepDone(1) ? "done" : "active"} />
              <h2 className="font-display text-2xl text-[var(--ink-0)]">Busca no Brasil</h2>
              {search.status === "loading" && (
                <span className="ml-auto status-pill tone-active">Buscando…</span>
              )}
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o produto, ex: iphone 15"
              className="search-input"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_QUERIES.map((s) => (
                <button key={s} type="button" onClick={() => setQuery(s)} className="action-pill">
                  {s}
                </button>
              ))}
            </div>

            <div className="mt-3 min-h-5 text-sm text-[var(--ink-muted)]">
              {search.status === "error"
                ? search.error
                : !hasSearchResults && query.trim().length >= 3 && search.status !== "loading"
                  ? "Nenhuma oferta encontrada."
                  : query.trim().length > 0 && query.trim().length < 3
                    ? "Continue digitando…"
                    : ""}
            </div>

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

            {hasSearchResults && search.results && (
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <button
                  type="button"
                  onClick={() => setSearchSourcesOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)] hover:text-[var(--ink-0)] transition-colors"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${searchSourcesOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {search.results.offers.length} ofertas · {search.results.providers.length} fontes
                </button>
                {searchSourcesOpen && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {search.results.providers.map((p) => (
                      <span key={p.storeKey} className={`status-pill ${providerTone(p.status)}`}>
                        {p.storeName} · {statusLabel(p.status)}
                        {p.status === "ok" ? ` (${p.offers.length})` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hasSearchResults && selectedBrazilOffer && (
              <div className="step-cta">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-widest text-[var(--ink-subtle)]">Oferta selecionada</p>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    aria-label="Histórico"
                    className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-0)] text-[var(--ink-muted)] hover:text-[var(--ink-0)] transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {history.length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-600)] text-[9px] font-bold text-white">
                        {history.length > 9 ? "9+" : history.length}
                      </span>
                    )}
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-display text-2xl text-[var(--ink-0)]">
                      {brazilBestPrice !== null ? money.format(brazilBestPrice) : "—"}
                    </span>
                    <span className="truncate text-xs text-[var(--ink-muted)]">{selectedBrazilOffer.storeName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={startOverseasWorkflow}
                    disabled={overseas.status === "running"}
                    className="step-cta-action"
                  >
                    {overseas.status === "running" ? "Pesquisando…" : "Pesquisar fora do Brasil →"}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Step 2: Overseas research ── */}
        {currentStep === 2 && (
          <section className="step-panel">
            <div className="mb-5 flex items-center gap-3">
              <StepBadge n={2} status={stepDone(2) ? "done" : "active"} />
              <h2 className="font-display text-2xl text-[var(--ink-0)]">Pesquisa Internacional</h2>
              {overseas.status === "running" && (
                <span className="ml-auto status-pill tone-active">Pesquisando…</span>
              )}
            </div>

            {/* Reference price chip */}
            {selectedBrazilOffer && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
                <p className="text-xs text-[var(--ink-muted)]">
                  Referência Brasil:
                  <span className="ml-1.5 font-semibold text-[var(--ink-0)]">
                    {money.format(selectedBrazilOffer.price)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="ml-auto text-xs text-[var(--brand-600)] hover:underline"
                >
                  ← alterar
                </button>
              </div>
            )}

            {/* Idle: prompt to start */}
            {overseas.status === "idle" && (
              <div className="py-6 text-center">
                <p className="text-sm text-[var(--ink-muted)]">
                  Pronto para pesquisar o produto no exterior.
                </p>
                <button
                  type="button"
                  onClick={startOverseasWorkflow}
                  className="action-pill action-pill-primary mt-4"
                >
                  Pesquisar fora do Brasil →
                </button>
              </div>
            )}

            {/* Live steps — only while running */}
            {overseas.status === "running" && overseas.steps.length > 0 && (
              <InlineWorkflowSteps steps={overseas.steps} />
            )}

            {overseas.error && (
              <p className="mt-3 rounded-lg border border-[var(--bad)]/30 bg-[var(--bad-soft)] p-3 text-sm text-[var(--bad)]">
                {overseas.error}
              </p>
            )}

            {overseas.result && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {overseas.result.offers.map((offer) => (
                    <OverseasOfferCard
                      key={offer.id}
                      offer={offer}
                      brazilReferencePriceBRL={overseas.result!.brazilReferencePriceBRL}
                      selected={offer.id === selectedOverseasOfferId}
                      onSelect={() => setSelectedOverseasOfferId(offer.id)}
                    />
                  ))}
                </div>

                <AgentLogs
                  steps={overseas.steps}
                  summary={overseas.result.summary}
                  warnings={overseas.result.warnings}
                />

                {selectedOverseasOffer && (
                  <div className="step-cta">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-widest text-[var(--ink-subtle)]">Destino selecionado</p>
                      <button
                        type="button"
                        onClick={() => setHistoryOpen(true)}
                        aria-label="Histórico"
                        className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-0)] text-[var(--ink-muted)] hover:text-[var(--ink-0)] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {history.length > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-600)] text-[9px] font-bold text-white">
                            {history.length > 9 ? "9+" : history.length}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-display text-2xl text-[var(--ink-0)]">
                          {money.format(selectedOverseasOffer.estimatedPriceBRL)}
                        </span>
                        <span className="truncate text-xs text-[var(--ink-muted)]">
                          {selectedOverseasOffer.city}, {selectedOverseasOffer.country}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="step-cta-action"
                      >
                        Planejar viagem →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Step 3: Trip planning ── */}
        {currentStep === 3 && (
          <section className="step-panel">
            <div className="mb-5 flex items-center gap-3">
              <StepBadge n={3} status={stepDone(3) ? "done" : "active"} />
              <h2 className="font-display text-2xl text-[var(--ink-0)]">Planejar a Viagem</h2>
              {trip.status === "running" && (
                <span className="ml-auto status-pill tone-active">Calculando…</span>
              )}
            </div>

            {/* Context bar */}
            {selectedOverseasOffer && selectedBrazilOffer && (
              <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
                <div className="flex-1 text-xs text-[var(--ink-muted)]">
                  <span className="font-medium text-[var(--ink-0)]">
                    {selectedOverseasOffer.city}, {selectedOverseasOffer.country}
                  </span>
                  <span className="mx-1.5 text-[var(--ink-subtle)]">·</span>
                  <span>{money.format(selectedOverseasOffer.estimatedPriceBRL)} no exterior</span>
                  <span className="mx-1.5 text-[var(--ink-subtle)]">vs</span>
                  <span>{money.format(selectedBrazilOffer.price)} no Brasil</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-[var(--brand-600)] hover:underline"
                >
                  ← alterar
                </button>
              </div>
            )}

            {/* Form */}
            {!tripResult && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="kicker text-[var(--ink-subtle)]">Origem</span>
                    <input
                      value={tripBrief.origin}
                      onChange={(e) => setTripBrief((c) => ({ ...c, origin: e.target.value }))}
                      className="field-input mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="kicker text-[var(--ink-subtle)]">Viajantes</span>
                    <input
                      value={tripBrief.travelers}
                      onChange={(e) => setTripBrief((c) => ({ ...c, travelers: e.target.value }))}
                      className="field-input mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="kicker text-[var(--ink-subtle)]">Noites</span>
                    <input
                      type="number" min={2} max={7}
                      value={tripBrief.tripLengthNights}
                      onChange={(e) => setTripBrief((c) => ({ ...c, tripLengthNights: e.target.value }))}
                      className="field-input mt-1.5"
                    />
                  </label>
                  <label className="block">
                    <span className="kicker text-[var(--ink-subtle)]">Hospedagem</span>
                    <textarea
                      value={tripBrief.stayPreference}
                      onChange={(e) => setTripBrief((c) => ({ ...c, stayPreference: e.target.value }))}
                      className="field-input mt-1.5 min-h-[80px] resize-y py-2.5"
                    />
                  </label>
                  <label className="block">
                    <span className="kicker text-[var(--ink-subtle)]">Prioridades</span>
                    <textarea
                      value={tripBrief.priorities}
                      onChange={(e) => setTripBrief((c) => ({ ...c, priorities: e.target.value }))}
                      className="field-input mt-1.5 min-h-[80px] resize-y py-2.5"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={startTripWorkflow}
                  disabled={!selectedBrazilOffer || !selectedOverseasOffer || trip.status === "running"}
                  className={`action-pill action-pill-primary mt-5 w-full justify-center ${
                    !selectedBrazilOffer || !selectedOverseasOffer || trip.status === "running" ? "opacity-60" : ""
                  }`}
                >
                  {trip.status === "running" ? "Calculando…" : "Calcular viagem completa →"}
                </button>
              </>
            )}

            {/* Live steps — only while running */}
            {trip.status === "running" && trip.steps.length > 0 && (
              <InlineWorkflowSteps steps={trip.steps} />
            )}

            {trip.error && (
              <p className="mt-3 rounded-lg border border-[var(--bad)]/30 bg-[var(--bad-soft)] p-3 text-sm text-[var(--bad)]">
                {trip.error}
              </p>
            )}

            {/* ── Results ── */}
            {tripResult && (
              <>
                {/* Final scorecard */}
                <Scorecard
                  brazilPrice={selectedBrazilOffer?.price ?? null}
                  productPriceBRL={tripResult.productPriceBRL}
                  tripSpendBRL={activeTripSpend}
                  savingsBRL={activeSavings}
                  recommendation={
                    activeSavings > 0
                      ? "A viagem ainda pode valer financeiramente se você conseguir fechar o produto e a janela sugeridos."
                      : "Com os custos atuais, a viagem parece mais cara do que comprar no Brasil, a menos que existam outros motivos para ir."
                  }
                  warnings={tripResult.warnings}
                />

                {/* Reset button */}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setTrip(emptyWorkflow()); }}
                    className="action-pill"
                  >
                    Recalcular viagem
                  </button>
                </div>

                {/* Tickets */}
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="kicker text-[var(--brand-600)]">Passagens</p>
                    <span className="code-chip">{tripResult.ticketOptions.length} opções</span>
                  </div>
                  <div className="space-y-3">
                    {tripResult.ticketOptions.map((opt) => (
                      <TicketCard
                        key={opt.id}
                        option={opt}
                        selected={opt.id === (activeTicket?.id ?? tripResult.bestTicketId)}
                        onSelect={() => setSelectedTicketId(opt.id)}
                      />
                    ))}
                  </div>
                </div>

                {/* Lodging */}
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="kicker text-[var(--brand-600)]">Hospedagem</p>
                    <span className="code-chip">{tripResult.lodgingOptions.length} opções</span>
                  </div>
                  <div className="space-y-3">
                    {tripResult.lodgingOptions.map((opt) => (
                      <LodgingCard
                        key={opt.id}
                        option={opt}
                        selected={opt.id === (activeLodging?.id ?? tripResult.bestLodgingId)}
                        onSelect={() => setSelectedLodgingId(opt.id)}
                      />
                    ))}
                  </div>
                </div>

                <AgentLogs steps={trip.steps} />

                <div className="step-cta">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <p className="text-[11px] uppercase tracking-widest text-[var(--ink-subtle)]">Pesquisa concluída</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setHistoryOpen(true)}
                        aria-label="Histórico"
                        className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-0)] text-[var(--ink-muted)] hover:text-[var(--ink-0)] transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {history.length > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-600)] text-[9px] font-bold text-white">
                            {history.length > 9 ? "9+" : history.length}
                          </span>
                        )}
                      </button>
                      <button type="button" onClick={resetAll} className="step-cta-action">
                        Nova busca →
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

      </div>
      <footer className="py-6 text-center">
        <p className="text-xs text-[var(--ink-subtle)]">
          Criado por Eduardo Fazolo
          {" · "}
          <a href="https://www.linkedin.com/in/eduardofazoloverona/" target="_blank" rel="noreferrer"
            className="hover:text-[var(--brand-600)] underline-offset-2 hover:underline">LinkedIn</a>
          {" · "}
          <a href="https://github.com/EduardoFazolo" target="_blank" rel="noreferrer"
            className="hover:text-[var(--brand-600)] underline-offset-2 hover:underline">GitHub</a>
        </p>
      </footer>


      {/* ── History backdrop ── */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* ── History panel — bottom sheet on mobile, right drawer on desktop ── */}
      <aside
        className={[
          "fixed z-50 flex flex-col",
          "bottom-0 left-0 right-0 h-[75vh] rounded-t-2xl",
          "sm:bottom-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:w-[360px] sm:rounded-none sm:rounded-l-2xl",
          "border border-[var(--line)] bg-[var(--surface-1)] shadow-[0_-4px_40px_rgba(0,0,0,0.15)]",
          "transition-transform duration-300 ease-in-out",
          historyOpen ? "" : "translate-y-full sm:translate-y-0 sm:translate-x-full",
        ].join(" ")}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div className="flex items-center gap-2">
            <p className="font-display text-base text-[var(--ink-0)]">Histórico</p>
            {history.length > 0 && (
              <span className="code-chip">{history.length}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={resetAll} className="action-pill">
              Nova busca
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-0)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {history.length === 0 ? (
            <p className="mt-10 text-center text-sm text-[var(--ink-subtle)]">
              Nenhuma pesquisa ainda.
            </p>
          ) : (
            history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => restoreEntry(entry)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2.5 text-left transition-colors hover:border-[var(--brand-300)] hover:bg-[var(--brand-50)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium text-[var(--ink-0)]">{entry.query}</p>
                  <span className={`status-pill shrink-0 ${entry.savingsBRL >= 0 ? "tone-completed" : "tone-error"}`}>
                    {entry.savingsBRL >= 0 ? "+" : ""}{money.format(entry.savingsBRL)}
                  </span>
                </div>
                {entry.destinationCity && (
                  <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                    {entry.destinationCity}, {entry.destinationCountry}
                  </p>
                )}
                <p className="mt-1 font-mono text-[10px] text-[var(--ink-subtle)]">
                  {relativeTime(entry.savedAt)} · {entry.hasTripResult ? "viagem completa" : "só exterior"}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

    </main>
  );
}
