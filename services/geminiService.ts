import { GoogleGenAI } from "@google/genai";

// New System Instruction: Analyze formatting needs instead of reconstructing HTML
const SYSTEM_INSTRUCTION = `
Eres un asistente experto en análisis de formularios y documentos administrativos.
Tu tarea NO es transcribir el documento, sino identificar qué campos necesita rellenar el usuario.

Analiza la imagen proporcionada y devuelve ÚNICAMENTE un objeto JSON con una lista de los campos que detectes que están vacíos o requieren acción del usuario (ej: firmas, fechas, nombres, casillas de selección).

Formato de respuesta esperado (JSON puro):
{
  "fields": [
    "Apellido Paterno",
    "Nombre",
    "DNI / Documento de Identidad",
    "Marcar casilla de Persona Natural/Jurídica",
    "Firma del Solicitante"
  ]
}

Sé conciso. Lista solo lo importante.
`;

export const analyzeDocumentFields = async (
  base64Image: string, 
  mimeType: string
): Promise<string[]> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-2.5-flash'; // Fast model is enough for this

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: "Lista los campos que se deben rellenar en este formulario.",
          },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) return [];

    const data = JSON.parse(text);
    return data.fields || [];

  } catch (error) {
    console.error("Analysis error:", error);
    return ["No se pudieron detectar campos automáticamente."];
  }
};

export const performOCR = async (
  base64Image: string,
  mimeType: string
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey });
  // Using Pro for better OCR accuracy on handwriting/forms
  const modelName = 'gemini-2.5-flash'; 

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: "Transcribe todo el texto visible en esta imagen. Devuelve solo el texto plano, respetando saltos de línea.",
          },
        ],
      },
    });

    return response.text || "";

  } catch (error) {
    console.error("OCR error:", error);
    return "Error al reconocer el texto.";
  }
};