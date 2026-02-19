/**
 * LLM Adapter Interface
 *
 * Defines the contract that all LLM adapters must implement.
 * This allows the agent to be LLM-agnostic while supporting
 * provider-specific features like function calling.
 */

export type {
  LlmAdapter,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  LlmResponse,
} from '../types/index.js';
