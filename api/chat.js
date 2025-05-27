import groq from 'groq-sdk';

export const config = {
  runtime: 'edge', // Enable streaming and fast response time on Vercel
};

export default async function handler(req) {
  try {
    const { model = 'llama3-70b-8192', messages, stream = true } = await req.json();

    const client = new groq.Client({
      apiKey: process.env.GROQ_API_KEY,
    });

    const completion = await client.chat.completions.create({
      model,
      messages,
      stream,
    });

    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      async start(controller) {
        for await (const chunk of completion) {
          const data = {
            id: chunk.id,
            object: chunk.object,
            created: chunk.created,
            model: chunk.model,
            choices: chunk.choices.map((choice) => ({
              index: choice.index,
              delta: {
                content: choice.delta?.content,
                role: choice.delta?.role,
              },
              finish_reason: choice.finish_reason,
            })),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(streamBody, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in /api/chat:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
