import { NextRequest } from "next/server";

import {
  researchLodgingStrategies,
  researchOverseasProduct,
  researchTicketWindows,
  TripResearchError,
} from "@/lib/deal-workflow";
import type { WorkflowEvent } from "@/lib/deal-workflow/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WorkflowName = "overseas" | "trip";

type WorkflowRequest =
  | ({
      workflow: "overseas";
    } & Record<string, unknown>)
  | ({
      workflow: "trip";
    } & Record<string, unknown>);

function jsonLine(event: WorkflowEvent) {
  return `${JSON.stringify(event)}\n`;
}

function heartbeatMessages(stepId: string) {
  switch (stepId) {
    case "market-scan":
      return [
        "Checando lojas, marketplaces e paginas de produto fora do Brasil.",
        "Comparando sinais de estoque, moeda e viabilidade de compra presencial.",
        "Filtrando ofertas fracas ou sem evidencia suficiente.",
      ];
    case "flight-scan":
      return [
        "Varrendo janelas de passagem para a rota escolhida.",
        "Comparando companhias, agregadores e sazonalidade defensavel.",
        "Refinando janelas com melhor custo-beneficio.",
      ];
    case "stay-scan":
      return [
        "Pesquisando hospedagem para a janela de voo mais promissora.",
        "Balanceando area, acesso e custo total da estadia.",
        "Descartando bairros fracos para uma viagem curta de compra.",
      ];
    default:
      return ["Pesquisando..."];
  }
}

async function withHeartbeat<T>(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  workflow: WorkflowName,
  stepId: string,
  label: string,
  task: () => Promise<T>,
) {
  const messages = heartbeatMessages(stepId);
  let tick = 0;
  const interval = setInterval(() => {
    const message = messages[tick % messages.length];
    tick += 1;
    void writer.write(
      encoder.encode(
        jsonLine({
          type: "step.updated",
          workflow,
          stepId,
          label,
          status: "running",
          message,
        }),
      ),
    );
  }, 1400);

  try {
    return await task();
  } finally {
    clearInterval(interval);
  }
}

export async function POST(request: NextRequest) {
  let payload: WorkflowRequest;

  try {
    payload = (await request.json()) as WorkflowRequest;
  } catch {
    return Response.json(
      { error: "Workflow expects a valid JSON body." },
      { status: 400 },
    );
  }

  if (!payload?.workflow || !["overseas", "trip"].includes(payload.workflow)) {
    return Response.json(
      { error: "Workflow must be either 'overseas' or 'trip'." },
      { status: 400 },
    );
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const run = async () => {
    try {
      await writer.write(
        encoder.encode(
          jsonLine({
            type: "workflow.started",
            workflow: payload.workflow,
            message:
              payload.workflow === "overseas"
                ? "Workflow iniciado: pesquisando precos fora do Brasil."
                : "Workflow iniciado: pesquisando voo, estadia e custo total da viagem.",
          }),
        ),
      );

      if (payload.workflow === "overseas") {
        await writer.write(
          encoder.encode(
            jsonLine({
              type: "step.updated",
              workflow: "overseas",
              stepId: "market-scan",
              label: "Agente de mercado",
              status: "running",
              message: "Analisando o produto selecionado e abrindo a busca internacional.",
            }),
          ),
        );

        const result = await withHeartbeat(
          writer,
          encoder,
          "overseas",
          "market-scan",
          "Agente de mercado",
          async () => researchOverseasProduct(payload),
        );

        await writer.write(
          encoder.encode(
            jsonLine({
              type: "step.updated",
              workflow: "overseas",
              stepId: "market-scan",
              label: "Agente de mercado",
              status: "completed",
              message: "Pesquisa internacional concluida com ofertas priorizadas.",
            }),
          ),
        );

        await writer.write(
          encoder.encode(
            jsonLine({
              type: "result",
              workflow: "overseas",
              data: result,
            }),
          ),
        );
      } else {
        await writer.write(
          encoder.encode(
            jsonLine({
              type: "step.updated",
              workflow: "trip",
              stepId: "flight-scan",
              label: "Agente de passagens",
              status: "running",
              message: "Abrindo a pesquisa de janelas de voo para o destino da oferta escolhida.",
            }),
          ),
        );

        const tripPayload = payload;
        const ticketPhase = await withHeartbeat(
          writer,
          encoder,
          "trip",
          "flight-scan",
          "Agente de passagens",
          async () => researchTicketWindows(tripPayload),
        );

        const featuredTicket =
          ticketPhase.tickets.ticketOptions.find(
            (item) => item.id === ticketPhase.tickets.bestTicketId,
          ) ?? ticketPhase.tickets.ticketOptions[0];

        if (!featuredTicket) {
          throw new TripResearchError(
            "Ticket research did not return usable flight windows.",
            502,
            "invalid_response",
          );
        }

        await writer.write(
          encoder.encode(
            jsonLine({
              type: "step.updated",
              workflow: "trip",
              stepId: "flight-scan",
              label: "Agente de passagens",
              status: "completed",
              message: "Janelas de passagem consolidadas.",
            }),
          ),
        );

        await writer.write(
          encoder.encode(
            jsonLine({
              type: "step.updated",
              workflow: "trip",
              stepId: "stay-scan",
              label: "Agente de hospedagem",
              status: "running",
              message: "Usando a melhor janela de voo para calcular hospedagem e custo total.",
            }),
          ),
        );

        const lodging = await withHeartbeat(
          writer,
          encoder,
          "trip",
          "stay-scan",
          "Agente de hospedagem",
          async () =>
            researchLodgingStrategies(ticketPhase.input, featuredTicket),
        );

        const featuredLodging =
          lodging.lodgingOptions.find(
            (item) => item.id === lodging.bestLodgingId,
          ) ?? lodging.lodgingOptions[0];

        if (!featuredLodging) {
          throw new TripResearchError(
            "Lodging research did not return usable options.",
            502,
            "invalid_response",
          );
        }

        const estimatedTripSpendBRL =
          ticketPhase.input.selectedOffer.estimatedPriceBRL +
          featuredTicket.estimatedRoundTripBRL +
          featuredLodging.estimatedTotalStayBRL;

        await writer.write(
          encoder.encode(
            jsonLine({
              type: "step.updated",
              workflow: "trip",
              stepId: "stay-scan",
              label: "Agente de hospedagem",
              status: "completed",
              message: "Custo total da viagem calculado com a oferta selecionada.",
            }),
          ),
        );

        await writer.write(
          encoder.encode(
            jsonLine({
              type: "result",
              workflow: "trip",
              data: {
                generatedAt: new Date().toISOString(),
                origin: ticketPhase.input.origin,
                destinationCity: ticketPhase.input.selectedOffer.city,
                destinationCountry: ticketPhase.input.selectedOffer.country,
                productOfferId: ticketPhase.input.selectedOffer.id,
                summary: `${ticketPhase.tickets.summary} ${lodging.summary}`.trim(),
                bestTicketId: featuredTicket.id,
                bestLodgingId: featuredLodging.id,
                ticketOptions: ticketPhase.tickets.ticketOptions,
                lodgingOptions: lodging.lodgingOptions,
                productPriceBRL: ticketPhase.input.selectedOffer.estimatedPriceBRL,
                estimatedTripSpendBRL,
                estimatedSavingsVsBrazilBRL:
                  ticketPhase.input.brazilReferencePriceBRL -
                  estimatedTripSpendBRL,
                recommendation:
                  estimatedTripSpendBRL <
                  ticketPhase.input.brazilReferencePriceBRL
                    ? "A viagem ainda pode valer financeiramente se voce realmente conseguir fechar o produto e a janela sugeridos."
                    : "Com os custos atuais, a viagem parece pior do que comprar no Brasil, a menos que existam outros motivos para ir.",
                warnings: [
                  ...ticketPhase.tickets.warnings,
                  ...lodging.warnings,
                ],
              },
            }),
          ),
        );
      }

      await writer.write(
        encoder.encode(
          jsonLine({
            type: "workflow.completed",
            workflow: payload.workflow,
            message:
              payload.workflow === "overseas"
                ? "Pesquisa internacional finalizada."
                : "Pesquisa de viagem finalizada.",
          }),
        ),
      );
    } catch (error) {
      const message =
        error instanceof TripResearchError
          ? error.message
          : "Unexpected workflow error.";

      await writer.write(
        encoder.encode(
          jsonLine({
            type: "error",
            workflow: payload.workflow,
            message,
          }),
        ),
      );
    } finally {
      await writer.close();
    }
  };

  void run();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
