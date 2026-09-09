const SYSTEM_INSTRUCTION = `
Eres un asistente experto en análisis de formularios y documentos administrativos.
Tu tarea NO es transcribir el documento, sino identificar qué campos necesita rellenar el usuario.

Analiza la imagen proporcionada y devuelve ÚNICAMENTE un objeto JSON con una lista de los campos que detectes que están vacíos o requieren acción del usuario.

Formato de respuesta esperado (JSON puro):
{
  "fields": [
    "Apellido Paterno",
    "Nombre",
    "DNI / Documento de Identidad",
    "Firma del Solicitante"
  ]
}
Sé conciso. Lista solo lo importante.
`;

export const analyzeDocumentFields = async (
  base64Image: string, 
  mimeType: string
): Promise<string[]> => {
  // En producción (GitHub Actions) tomará el valor inyectado en process.env.VITE_DEEPINFRA_API_KEY, localmente de .env.local
  const apiKey = import.meta.env.VITE_DEEPINFRA_API_KEY;
  if (!apiKey) {
    throw new Error("API Key de DeepInfra no configurada.");
  }

  // Usamos un modelo Vision de DeepInfra, ej: Llama-3.2-11B-Vision-Instruct
  const modelName = 'meta-llama/Llama-3.2-11B-Vision-Instruct'; 

  try {
    const response = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          {
            role: "user",
            content: [
              { type: "text", text: "Lista los campos que se deben rellenar en este formulario." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Error de DeepInfra: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) return [];

    const parsed = JSON.parse(text);
    return parsed.fields || [];

  } catch (error) {
    console.error("Analysis error:", error);
    return ["No se pudieron detectar campos automáticamente."];
  }
};

export const performOCR = async (
  base64Image: string,
  mimeType: string
): Promise<string> => {
  const apiKey = import.meta.env.VITE_DEEPINFRA_API_KEY;
  if (!apiKey) {
    throw new Error("API Key de DeepInfra no configurada.");
  }

  const modelName = 'meta-llama/Llama-3.2-11B-Vision-Instruct'; 

  try {
    const response = await fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe todo el texto visible en esta imagen. Devuelve solo el texto plano, respetando saltos de línea y sin añadir descripciones adicionales." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Error de DeepInfra: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";

  } catch (error) {
    console.error("OCR error:", error);
    return "Error al reconocer el texto.";
  }
};