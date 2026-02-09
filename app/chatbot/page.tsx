"use client"

import React from "react"

import { useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AppHeader } from "@/components/app-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Send, Bot, User, Loader2, Shield, Zap, Search as SearchIcon, AlertTriangle } from "lucide-react"

const suggestedQueries = [
  {
    icon: AlertTriangle,
    label: "Analyze brute force attack",
    query: "We're seeing a brute force attack on Azure AD from IP 185.220.101.34. What steps should we take to investigate and respond?",
  },
  {
    icon: SearchIcon,
    label: "Investigate PowerShell alert",
    query: "An encoded PowerShell command was detected on our domain controller. How should we investigate this and what are the indicators of compromise to look for?",
  },
  {
    icon: Zap,
    label: "DNS tunneling detection",
    query: "We suspect DNS tunneling is being used for data exfiltration. What KQL queries can we use in Sentinel to detect this, and what remediation steps should we take?",
  },
  {
    icon: Shield,
    label: "Improve security posture",
    query: "What are the top 5 things we should implement in our Azure environment to improve our security posture against advanced persistent threats?",
  },
]

export default function ChatbotPage() {
  const [input, setInput] = useState("")
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  })

  const isLoading = status === "streaming" || status === "submitted"

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput("")
  }

  const handleSuggestion = (query: string) => {
    if (isLoading) return
    sendMessage({ text: query })
  }

  return (
    <DashboardLayout>
      <AppHeader title="AI Security Assistant" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 lg:p-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <Bot className="h-8 w-8 text-primary" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">Sentinel AI Assistant</h2>
                <p className="mt-1 text-center text-sm text-muted-foreground max-w-md">
                  Ask me about threat analysis, incident response, log investigation, or security best practices for your Azure environment.
                </p>
                <div className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  {suggestedQueries.map((item) => (
                    <Card
                      key={item.label}
                      className="cursor-pointer bg-card border-border transition-colors hover:bg-secondary/50"
                      onClick={() => handleSuggestion(item.query)}
                    >
                      <CardContent className="flex items-start gap-3 p-4">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <item.icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-foreground">{item.label}</span>
                          <span className="text-[10px] leading-relaxed text-muted-foreground line-clamp-2">{item.query}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    )}
                  >
                    {message.parts.map((part, index) => {
                      if (part.type === "text") {
                        return (
                          <div key={index} className="whitespace-pre-wrap">
                            {part.text}
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                  {message.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <User className="h-3.5 w-3.5 text-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Analyzing...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border bg-card p-4">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about threats, incidents, or security best practices..."
              className="flex-1 bg-secondary text-sm text-foreground placeholder:text-muted-foreground"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground">
            Sentinel AI provides security analysis assistance. Always verify recommendations with your security team.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}
