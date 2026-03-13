"use client";

import type { FormEvent } from "react";
import { useRef, useState, useTransition } from "react";

import type {
  HousingOption,
  TicketResearchOption,
  TripResearchResponse,
} from "@/lib/trip-research/types";
import {
  formatTravelerCount,
  normalizeTravelerCountInput,
  parseTravelerCount,
} from "@/lib/travelers";

type TripFormState = {
  origin: string;
  destination: string;
  earliestDepartureMonth: string;
  latestDepartureMonth: string;
  tripLengthNights: string;
  travelers: string;
  budgetNotes: string;
  priorities: string;
  lodgingPreferences: string;
};

type ApiError = {
  error?: string;
};

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function formatMonthOffset(offset: number) {
  const value = new Date();
  const year = value.getFullYear();
  const month = value.getMonth() + offset + 1;
  const normalizedYear = year + Math.floor((month - 1) / 12);
  const normalizedMonth = ((month - 1 + 12) % 12) + 1;

  return `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`;
}

function initialFormState(): TripFormState {
  return {
    origin: "Sao Paulo (GRU)",
    destination: "Lisboa",
    earliestDepartureMonth: formatMonthOffset(1),
    latestDepartureMonth: formatMonthOffset(6),
    tripLengthNights: "7",
    travelers: "2 adultos",
    budgetNotes:
      "Prioridade total para custo-beneficio, mesmo com horarios menos nobres.",
    priorities: "Datas baratas, companhias confiaveis e bairros walkable.",
    lodgingPreferences: "Apartamento ou hotel boutique com boa localizacao.",
  };
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

function formatTicketWindow(option: TicketResearchOption) {
  return `${formatDate(option.departureWindow.start)} - ${formatDate(option.departureWindow.end)} / volta ${formatDate(option.returnWindow.start)} - ${formatDate(option.returnWindow.end)}`;
}

function SourceList({
  sources,
}: {
  sources: { label: string; url: string; note: string }[];
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
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

function TicketCard({
  option,
  selected,
}: {
  option: TicketResearchOption;
  selected: boolean;
}) {
  return (
    <article
      className={`rounded-[1.7rem] border p-5 transition ${
        selected
          ? "border-[var(--sea-300)]/45 bg-[rgba(103,232,249,0.08)]"
          : "border-white/10 bg-[rgba(0,0,0,0.16)]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[var(--sea-200)]">
            {selected ? "Janela recomendada" : "Alternativa de passagem"}
          </p>
          <h3 className="mt-3 font-display text-3xl text-[var(--sand-50)]">
            {option.title}
          </h3>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {option.confidence}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm leading-7 text-[var(--muted-strong)]">
            {option.whyItIsCheaper}
          </p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {formatTicketWindow(option)} • {option.tripLengthNights} noites
          </p>
        </div>
        <div className="rounded-[1.3rem] border border-white/10 bg-black/20 px-4 py-3 text-right">
          <p className="eyebrow text-[var(--muted)]">Faixa observada</p>
          <p className="mt-2 font-display text-3xl text-[var(--sand-50)]">
            {option.priceRange}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {option.typicalCarriers.map((carrier) => (
          <span
            key={carrier}
            className="rounded-full border border-white/10 bg-[rgba(255,255,255,0.07)] px-3 py-1.5 text-sm text-[var(--muted)]"
          >
            {carrier}
          </span>
        ))}
        {option.bookingChannels.map((channel) => (
          <span
            key={channel}
            className="rounded-full border border-white/10 bg-[rgba(0,0,0,0.2)] px-3 py-1.5 text-sm text-[var(--sea-200)]"
          >
            {channel}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="eyebrow text-[var(--muted)]">Sinais de oportunidade</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted-strong)]">
            {option.dealSignals.map((signal) => (
              <li key={signal}>• {signal}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow text-[var(--muted)]">Tradeoffs</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted-strong)]">
            {option.tradeoffs.map((tradeoff) => (
              <li key={tradeoff}>• {tradeoff}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-5 text-sm text-[var(--sun-300)]">Melhor para: {option.bestFor}</p>

      <SourceList sources={option.sources} />
    </article>
  );
}

function HousingCard({ option }: { option: HousingOption }) {
  return (
    <article className="rounded-[1.7rem] border border-white/10 bg-[rgba(0,0,0,0.16)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[var(--sun-300)]">Base de hospedagem</p>
          <h3 className="mt-3 font-display text-3xl text-[var(--sand-50)]">
            {option.area}
          </h3>
          <p className="mt-2 text-sm text-[var(--sea-200)]">{option.propertyStyle}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {option.confidence}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <p className="text-sm leading-7 text-[var(--muted-strong)]">{option.whyStayHere}</p>
        <div className="rounded-[1.3rem] border border-white/10 bg-black/20 px-4 py-3 text-right">
          <p className="eyebrow text-[var(--muted)]">Faixa noturna</p>
          <p className="mt-2 font-display text-3xl text-[var(--sand-50)]">
            {option.nightlyRange}
          </p>
          <p className="mt-1 text-xs text-[var(--sea-200)]">
            Total estimado: {option.totalStayRange}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <p className="eyebrow text-[var(--muted)]">Acesso e contexto</p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">
            {option.accessNotes}
          </p>
        </div>
        <div>
          <p className="eyebrow text-[var(--muted)]">Como reservar melhor</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted-strong)]">
            {option.bookingAdvice.map((tip) => (
              <li key={tip}>• {tip}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-5 text-sm text-[var(--sun-300)]">Melhor para: {option.idealTraveler}</p>

      <SourceList sources={option.sources} />
    </article>
  );
}

export function TripPlanner() {
  const [form, setForm] = useState<TripFormState>(initialFormState);
  const [result, setResult] = useState<TripResearchResponse | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  function updateField<K extends keyof TripFormState>(field: K, value: TripFormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    if (
      form.earliestDepartureMonth &&
      form.latestDepartureMonth &&
      form.earliestDepartureMonth > form.latestDepartureMonth
    ) {
      setResult(null);
      setError(
        "O mes inicial precisa ser anterior ou igual ao mes final da janela.",
      );
      return;
    }

    setError("");
    setResult(null);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/trip-research", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            travelers: formatTravelerCount(parseTravelerCount(form.travelers)),
            tripLengthNights: Number.parseInt(form.tripLengthNights, 10),
          }),
        });

        const payload = (await response.json()) as TripResearchResponse | ApiError;

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (!response.ok) {
          setResult(null);
          setError(
            "error" in payload
              ? payload.error ?? "Nao foi possivel concluir a pesquisa."
              : "Nao foi possivel concluir a pesquisa.",
          );
          return;
        }

        setResult(payload as TripResearchResponse);
      })().catch(() => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setResult(null);
        setError("Nao foi possivel concluir a pesquisa.");
      });
    });
  }

  const featuredTicket = result?.featuredTicket ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <article className="panel-shell rounded-[1.8rem] p-5 sm:p-6">
        <p className="eyebrow text-[var(--sun-300)]">Desk de viagem</p>
        <h2 className="mt-3 font-display text-4xl text-[var(--sand-50)]">
          Pesquise a viagem como um funil: passagem primeiro, hospedagem depois.
        </h2>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
          O fluxo usa pesquisa web via OpenAI para montar uma leitura atualizada
          de datas mais baratas, companhias, canais de compra e, na sequencia,
          bairros e faixas de hospedagem para a janela escolhida.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {["1. Brief", "2. Melhores janelas", "3. Onde ficar"].map((step) => (
            <span
              key={step}
              className="rounded-full border border-white/10 bg-[rgba(255,255,255,0.07)] px-3 py-1.5 text-sm text-[var(--muted)]"
            >
              {step}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="eyebrow text-[var(--muted)]">Origem</span>
              <input
                value={form.origin}
                onChange={(event) => updateField("origin", event.target.value)}
                className="field-input"
                placeholder="Sao Paulo (GRU)"
              />
            </label>
            <label className="space-y-2">
              <span className="eyebrow text-[var(--muted)]">Destino</span>
              <input
                value={form.destination}
                onChange={(event) => updateField("destination", event.target.value)}
                className="field-input"
                placeholder="Lisboa"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2">
              <span className="eyebrow text-[var(--muted)]">Saida a partir de</span>
              <input
                type="month"
                value={form.earliestDepartureMonth}
                onChange={(event) =>
                  updateField("earliestDepartureMonth", event.target.value)
                }
                className="field-input"
              />
            </label>
            <label className="space-y-2">
              <span className="eyebrow text-[var(--muted)]">Saida ate</span>
              <input
                type="month"
                value={form.latestDepartureMonth}
                onChange={(event) =>
                  updateField("latestDepartureMonth", event.target.value)
                }
                className="field-input"
              />
            </label>
            <label className="space-y-2">
              <span className="eyebrow text-[var(--muted)]">Noites</span>
              <input
                type="number"
                min={2}
                max={21}
                value={form.tripLengthNights}
                onChange={(event) =>
                  updateField("tripLengthNights", event.target.value)
                }
                className="field-input"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="eyebrow text-[var(--muted)]">Viajantes</span>
            <div className="relative">
              <input
                type="number"
                min={1}
                max={6}
                inputMode="numeric"
                value={parseTravelerCount(form.travelers)}
                onChange={(event) =>
                  updateField("travelers", normalizeTravelerCountInput(event.target.value))
                }
                aria-label="Quantidade de adultos"
                className="field-input pr-24 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-medium text-[var(--muted)]">
                {parseTravelerCount(form.travelers) === 1 ? "Adulto" : "Adultos"}
              </span>
            </div>
          </label>

          <label className="space-y-2">
            <span className="eyebrow text-[var(--muted)]">Prioridades</span>
            <textarea
              value={form.priorities}
              onChange={(event) => updateField("priorities", event.target.value)}
              className="field-input min-h-[110px] resize-y py-3"
              placeholder="Datas baratas, bairro walkable, voo direto..."
            />
          </label>

          <label className="space-y-2">
            <span className="eyebrow text-[var(--muted)]">Notas de budget</span>
            <textarea
              value={form.budgetNotes}
              onChange={(event) => updateField("budgetNotes", event.target.value)}
              className="field-input min-h-[110px] resize-y py-3"
              placeholder="Qual nivel de economia voce quer priorizar?"
            />
          </label>

          <label className="space-y-2">
            <span className="eyebrow text-[var(--muted)]">Preferencia de hospedagem</span>
            <input
              value={form.lodgingPreferences}
              onChange={(event) =>
                updateField("lodgingPreferences", event.target.value)
              }
              className="field-input"
              placeholder="Apartamento, hotel boutique..."
            />
          </label>

          <button
            type="submit"
            disabled={isPending}
            className={`action-pill action-pill-primary w-full justify-center ${
              isPending ? "cursor-not-allowed opacity-70" : ""
            }`}
          >
            {isPending
              ? "Pesquisando passagem e hospedagem..."
              : "Pesquisar melhor viagem"}
          </button>
        </form>

        {error ? (
          <div className="mt-5 rounded-[1.4rem] border border-[var(--rose-400)]/35 bg-[var(--rose-400)]/12 p-4 text-sm leading-6 text-[var(--rose-50)]">
            {error}
          </div>
        ) : null}
      </article>

      <div className="space-y-5">
        {result ? (
          <>
            <article className="panel-shell rounded-[1.8rem] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="eyebrow text-[var(--sea-200)]">Leitura da viagem</p>
                  <h3 className="mt-3 font-display text-4xl text-[var(--sand-50)]">
                    {result.ticketResearch.summary}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-[var(--muted-strong)]">
                    Janela destacada para a rota {result.brief.origin} →{" "}
                    {result.brief.destination}.
                  </p>
                </div>
                {featuredTicket ? (
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/20 px-4 py-4 text-right">
                    <p className="eyebrow text-[var(--muted)]">Janela escolhida</p>
                    <p className="mt-2 font-display text-3xl text-[var(--sand-50)]">
                      {featuredTicket.priceRange}
                    </p>
                    <p className="mt-2 max-w-[14rem] text-xs leading-5 text-[var(--sea-200)]">
                      {formatTicketWindow(featuredTicket)}
                    </p>
                  </div>
                ) : null}
              </div>
            </article>

            <article className="panel-muted rounded-[1.8rem] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-[var(--sea-200)]">Etapa 1</p>
                  <h3 className="mt-2 font-display text-3xl text-[var(--sand-50)]">
                    Janelas de passagem com melhor valor
                  </h3>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {result.ticketResearch.options.length} cenarios pesquisados
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {result.ticketResearch.options.map((option) => (
                  <TicketCard
                    key={option.id}
                    option={option}
                    selected={option.id === result.ticketResearch.bestWindowId}
                  />
                ))}
              </div>
            </article>

            <article className="panel-muted rounded-[1.8rem] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow text-[var(--sun-300)]">Etapa 2</p>
                  <h3 className="mt-2 font-display text-3xl text-[var(--sand-50)]">
                    Onde ficar na janela mais forte
                  </h3>
                </div>
                {featuredTicket ? (
                  <p className="text-sm text-[var(--muted)]">
                    Baseado em {formatTicketWindow(featuredTicket)}
                  </p>
                ) : null}
              </div>

              {result.housingResearch ? (
                <>
                  <p className="mt-4 text-sm leading-7 text-[var(--muted-strong)]">
                    {result.housingResearch.summary}
                  </p>
                  <div className="mt-5 space-y-4">
                    {result.housingResearch.options.map((option) => (
                      <HousingCard key={option.id} option={option} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-[1.4rem] border border-dashed border-white/12 bg-[rgba(0,0,0,0.14)] p-5 text-sm leading-7 text-[var(--muted)]">
                  A pesquisa de hospedagem nao retornou um bloco completo nesta
                  rodada. O backend ainda preserva a janela vencedora e registra
                  o motivo nos alertas abaixo.
                </div>
              )}
            </article>

            <article className="panel-muted rounded-[1.8rem] p-5 sm:p-6">
              <p className="eyebrow text-[var(--muted)]">Alertas e caveats</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[var(--muted-strong)]">
                {result.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            </article>
          </>
        ) : (
          <article className="panel-muted rounded-[1.8rem] border border-dashed border-white/12 p-6 sm:p-8">
            <p className="eyebrow text-[var(--sun-300)]">Fluxo encadeado</p>
            <h3 className="mt-3 font-display text-4xl text-[var(--sand-50)]">
              A pesquisa monta primeiro as melhores janelas de passagem.
            </h3>
            <div className="mt-5 space-y-3 text-sm leading-7 text-[var(--muted)]">
              <p>
                Depois disso, o segundo bloco reaproveita a janela vencedora para
                pesquisar bairros, estilos de estadia e faixas de diaria.
              </p>
              <p>
                O resultado final vira um pacote de decisao: quando ir, com quem
                voar, por que aquela janela parece barata e onde vale a pena
                ficar.
              </p>
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
