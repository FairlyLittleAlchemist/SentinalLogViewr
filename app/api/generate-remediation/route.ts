import { NextResponse } from "next/server"
import { generateText } from "ai"

export const dynamic = "force-dynamic"

type RemediationResponse = {
  remediation_steps: string
  containment_steps: string
  validation_steps: string
  confidence: number
  analysis: string
  category: string
}

export async function POST(request: Request) {
  try {
    const { query, context } = await request.json()

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    const systemPrompt = `Tu es un expert en cybersécurité et en réponse aux incidents. 
Quand on te demande de générer des étapes de remédiation pour un incident de sécurité, tu dois:
1. Fournir des étapes claires et complètes
2. Être spécifique et actionnable
3. Inclure les vérifications de validation
4. Couvrir la confinement et l'éradication
5. Répondre en français

Format ta réponse JSON strictement ainsi:
{
  "remediation_steps": "Étape 1. Description complète\\nÉtape 2. Description complète\\n...",
  "containment_steps": "Étape 1. Description\\nÉtape 2. Description\\n...",
  "validation_steps": "Vérification 1\\nVérification 2\\n...",
  "confidence": 0.75,
  "category": "catégorie de l'incident",
  "analysis": "Analyse brève du problème"
}`

    const userPrompt = `Génère des étapes complètes de remédiation pour ce problème de sécurité: "${query}"${
      context ? `\n\nContexte: ${context}` : ""
    }`

    const result = await generateText({
      model: "openai/gpt-5-mini",
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 2000,
    })

    // Parse le JSON du résultat
    let parsedResponse: RemediationResponse
    try {
      // Extraire le JSON du texte
      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error("Pas de JSON trouvé dans la réponse")
      }
      parsedResponse = JSON.parse(jsonMatch[0])
    } catch (parseError) {
      // Fallback: créer une réponse structurée si le parsing échoue
      parsedResponse = {
        remediation_steps: result.text,
        containment_steps: "À évaluer selon le contexte",
        validation_steps: "Vérifier que le problème est résolu",
        confidence: 0.6,
        category: "Incident de sécurité",
        analysis: `Recommandations générées pour: ${query}`,
      }
    }

    return NextResponse.json({
      source: "LLM Generated",
      query,
      method_used: "llm-generation",
      results: [
        {
          remediation_steps: parsedResponse.remediation_steps,
          containment_steps: parsedResponse.containment_steps,
          validation_steps: parsedResponse.validation_steps,
          category: parsedResponse.category,
          confidence: parsedResponse.confidence || 0.7,
          method: "LLM Generation",
          alert_title: query,
          outcome: "Generated",
          root_cause: "À analyser",
        },
      ],
      results_count: 1,
      analysis: parsedResponse.analysis,
      confidence: parsedResponse.confidence || 0.7,
      remediation_steps: [parsedResponse.remediation_steps],
      containment_steps: [parsedResponse.containment_steps],
      validation_steps: [parsedResponse.validation_steps],
    })
  } catch (error) {
    console.error("Remediation generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur de génération" },
      { status: 500 }
    )
  }
}
