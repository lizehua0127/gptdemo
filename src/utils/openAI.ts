import { createParser } from 'eventsource-parser'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'

const model = import.meta.env.OPENAI_API_MODEL || 'gpt-3.5-turbo'
const apiType = import.meta.env.API_TYPE || 'open_ai'
const apiVersion = import.meta.env.API_VERSION || ''

export const generatePayload = (apiKey: string, messages: ChatMessage[]): RequestInit & { dispatcher?: any } => {
  if (apiType === 'azure') {
    return {
      headers: {
        'Content-Type': 'application/json',
        'api-key': `${apiKey}`,
      },
      method: 'POST',
      body: JSON.stringify({
        messages,
        temperature: 0.6,
        stream: true,
        max_tokens: 800,
      }),
    }
  } else {
    return {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      method: 'POST',
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
        stream: true,
      }),
    }
  }
}

export const gennerateURL = (baseURL: string): string => {
  if (apiType === 'azure') {
    // https://mytestgpt001.openai.azure.com/openai/deployments/Gpt35/chat/completions?api-version=2023-03-15-preview
    return `${baseURL}/openai/deployments/Gpt35/chat/completions?api-version=${apiVersion}`
  } else {
    return `${baseURL}/v1/chat/completions`
  }
}

export const parseOpenAIStream = (rawResponse: Response) => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  if (!rawResponse.ok) {
    return new Response(rawResponse.body, {
      status: rawResponse.status,
      statusText: rawResponse.statusText,
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const streamParser = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.close()
            return
          }
          try {
            // response = {
            //   id: 'chatcmpl-6pULPSegWhFgi0XQ1DtgA3zTa1WR6',
            //   object: 'chat.completion.chunk',
            //   created: 1677729391,
            //   model: 'gpt-3.5-turbo-0301',
            //   choices: [
            //     { delta: { content: '你' }, index: 0, finish_reason: null }
            //   ],
            // }
            const json = JSON.parse(data)
            const text = json.choices[0].delta?.content || ''
            const queue = encoder.encode(text)
            controller.enqueue(queue)
          } catch (e) {
            controller.error(e)
          }
        }
      }

      const parser = createParser(streamParser)
      for await (const chunk of rawResponse.body as any)
        parser.feed(decoder.decode(chunk))
    },
  })

  return new Response(stream)
}
