import Link from "next/link";

import type { SearchOffer, SearchResponse } from "@/lib/search/types";

type ProductLaneProps = {
  query: string;
  results: SearchResponse | null;
};

const SAMPLE_QUERIES = [
  "iphone 15",
  "playstation 5",
  "air fryer philips walita",
  "monitor gamer 27",
];

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function statusLabel(status: SearchResponse["providers"][number]["status"]) {
  switch (status) {
    case "ok":
      return "Coletando";
    case "empty":
      return "Sem ofertas";
    case "not_configured":
      return "Aguardando pitchlabs";
    case "error":
      return "Falhou";
    default:
      return "Parcial";
  }
}

function statusTone(status: SearchResponse["providers"][number]["status"]) {
  switch (status) {
    case "ok":
      return "border-[var(--sea-400)]/35 bg-[var(--sea-400)]/12 text-[var(--sea-50)]";
    case "not_configured":
      return "border-[var(--sun-400)]/35 bg-[var(--sun-400)]/12 text-[var(--sun-100)]";
    case "error":
      return "border-[var(--rose-400)]/35 bg-[var(--rose-400)]/12 text-[var(--rose-50)]";
    default:
      return "border-white/10 bg-white/7 text-[var(--muted)]";
  }
}

function offerMeta(offer: SearchOffer) {
  return [
    offer.installments,
    offer.seller ? `Seller ${offer.seller}` : undefined,
    offer.shipping,
  ].filter(Boolean);
}

function ResultCard({ offer, index }: { offer: SearchOffer; index: number }) {
  return (
    <article className="panel-shell relative overflow-hidden rounded-[1.8rem] p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,250,241,0.55),transparent)]" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[var(--sea-200)]">
            #{String(index + 1).padStart(2, "0")} • {offer.storeName}
          </p>
          <h3 className="mt-3 font-display text-3xl leading-tight text-[var(--sand-50)]">
            {offer.title}
          </h3>
        </div>

        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
          {offer.source}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="eyebrow text-[var(--muted)]">Menor preço encontrado</p>
          <p className="mt-2 font-display text-5xl leading-none text-[var(--sand-50)]">
            {money.format(offer.price)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
          {offerMeta(offer).map((entry) => (
            <span
              key={entry}
              className="rounded-full border border-white/10 bg-white/7 px-3 py-1.5"
            >
              {entry}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href={offer.url}
          target="_blank"
          rel="noreferrer"
          className="action-pill action-pill-primary"
        >
          Abrir oferta
        </a>
        {offer.image ? (
          <a
            href={offer.image}
            target="_blank"
            rel="noreferrer"
            className="action-pill"
          >
            Ver imagem
          </a>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <article className="panel-muted rounded-[1.8rem] border border-dashed border-white/12 p-6 sm:p-8">
      <p className="eyebrow text-[var(--sea-200)]">Radar inicial</p>
      <h3 className="mt-3 font-display text-4xl text-[var(--sand-50)]">
        Pesquise um produto para ver o ranking limpo por preço.
      </h3>
      <div className="mt-5 space-y-3 text-sm leading-7 text-[var(--muted)]">
        <p>
          O endpoint <code>GET /api/search?q=...</code> continua intacto, mas a
          leitura agora destaca preço, origem da oferta e saúde dos coletores.
        </p>
        <p>
          A lane de produto continua pensada como um radar rápido para lojas
          brasileiras.
        </p>
      </div>
    </article>
  );
}

export function ProductLane({ query, results }: ProductLaneProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.86fr_1.14fr]">
      <aside className="space-y-5">
        <article className="panel-shell rounded-[1.8rem] p-5 sm:p-6">
          <p className="eyebrow text-[var(--sea-200)]">Radar de produtos</p>
          <h2 className="mt-3 font-display text-4xl text-[var(--sand-50)]">
            Compare as ofertas reais sem navegar em cinco abas.
          </h2>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Mercado Livre, Amazon BR, KaBuM, Americanas e o slot dedicado ao
            pitchlabs ficam visíveis na mesma leitura.
          </p>

          <form className="mt-6 space-y-3">
            <label className="sr-only" htmlFor="query">
              Buscar produto
            </label>
            <input
              id="query"
              name="q"
              defaultValue={query}
              placeholder="iphone 15, cafeteira nespresso, monitor gamer..."
              className="h-14 w-full rounded-[1.2rem] border border-white/10 bg-[var(--surface-strong)] px-4 text-[var(--sand-50)] outline-none placeholder:text-white/35 focus:border-[var(--sea-300)]/55"
            />
            <button type="submit" className="action-pill action-pill-primary w-full justify-center">
              Buscar produto
            </button>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            {SAMPLE_QUERIES.map((sample) => (
              <Link key={sample} href={`/?q=${encodeURIComponent(sample)}#product-lane`} className="action-pill">
                {sample}
              </Link>
            ))}
          </div>
        </article>

        <article className="panel-muted rounded-[1.8rem] p-5 sm:p-6">
          <p className="eyebrow text-[var(--sun-300)]">Cobertura atual</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Mercado Livre", "Amazon BR", "KaBuM", "Americanas", "Pitchlabs"].map(
              (store) => (
                <span
                  key={store}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  {store}
                </span>
              ),
            )}
          </div>
        </article>

        {results ? (
          <article className="panel-shell rounded-[1.8rem] p-5 sm:p-6">
            <p className="eyebrow">Resumo da busca</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="eyebrow text-[var(--muted)]">Query</p>
                <p className="mt-2 text-lg text-[var(--sand-50)]">{results.query}</p>
              </div>
              <div>
                <p className="eyebrow text-[var(--muted)]">Ofertas</p>
                <p className="mt-2 font-display text-4xl text-[var(--sand-50)]">
                  {results.offers.length}
                </p>
              </div>
              <div>
                <p className="eyebrow text-[var(--muted)]">Melhor preço</p>
                <p className="mt-2 font-display text-4xl text-[var(--sand-50)]">
                  {results.offers[0] ? money.format(results.offers[0].price) : "n/a"}
                </p>
              </div>
            </div>
          </article>
        ) : null}
      </aside>

      <div className="space-y-5">
        {results ? (
          results.offers.length > 0 ? (
            <>
              <div className="grid gap-5 md:grid-cols-2">
                {results.providers.map((provider) => (
                  <article
                    key={provider.storeKey}
                    className="panel-muted rounded-[1.6rem] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="eyebrow text-[var(--muted)]">{provider.storeName}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">
                          {provider.note ?? `${provider.offers.length} ofertas válidas.`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${statusTone(provider.status)}`}
                      >
                        {statusLabel(provider.status)}
                      </span>
                    </div>

                    <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                      {provider.offers.length} resultados • {provider.latencyMs} ms
                    </p>
                  </article>
                ))}
              </div>

              {results.offers.map((offer, index) => (
                <ResultCard key={`${offer.storeKey}-${offer.url}`} offer={offer} index={index} />
              ))}
            </>
          ) : (
            <article className="panel-muted rounded-[1.8rem] border border-dashed border-white/12 p-6 sm:p-8">
              <p className="eyebrow text-[var(--sea-200)]">Sem match útil</p>
              <h3 className="mt-3 font-display text-4xl text-[var(--sand-50)]">
                Nenhuma oferta consistente apareceu para essa busca.
              </h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted)]">
                Tente uma consulta mais específica com marca, modelo ou capacidade.
              </p>
            </article>
          )
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
