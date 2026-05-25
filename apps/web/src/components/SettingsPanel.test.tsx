import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel.js';

const mockSaveSettings = vi.fn().mockResolvedValue({ success: true });
const mockSetTheme = vi.fn();

vi.mock('../store/index.js', () => {
  return {
    useAppStore: () => ({
      settings: {
        models: {
          low: { provider: 'ollama', model: 'qwen2.5-coder:7b' },
          medium: { provider: 'ollama', model: 'qwen2.5-coder:32b' },
          high: { provider: 'openai', model: 'gpt-4o' },
          embedding: { provider: 'ollama', model: 'nomic-embed-text' },
        },
        keys: {
          ollamaBaseUrl: 'http://localhost:11434',
          openaiApiKey: 'sk-123',
          anthropicApiKey: '',
          googleApiKey: '',
          groqApiKey: '',
        },
        availableProviders: ['ollama', 'openai', 'anthropic', 'google', 'groq'],
      },
      saveSettings: mockSaveSettings,
      theme: 'obsidian',
      setTheme: mockSetTheme,
      maxSteps: 20,
      setMaxSteps: vi.fn(),
      requireApproval: false,
      setRequireApproval: vi.fn(),
      systemPromptInstructions: 'Test instructions',
      setSystemPromptInstructions: vi.fn(),
      indexingExcludes: '**/node_modules/**',
      setIndexingExcludes: vi.fn(),
    }),
  };
});

describe('SettingsPanel Component', () => {
  it('renders initial form values from store settings after navigating tabs', async () => {
    render(<SettingsPanel />);
    
    // Default tab is "Agent Control"
    expect(screen.getByText('Max Tool Execution Steps')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test instructions')).toBeInTheDocument();

    // Click "Models & Providers" tab to view model fields
    fireEvent.click(screen.getByText('Models & Providers'));
    expect(screen.getByText('Low Complexity Tasks')).toBeInTheDocument();
    expect(screen.getByDisplayValue('qwen2.5-coder:7b')).toBeInTheDocument();

    // Click "API Credentials" tab to view key fields
    fireEvent.click(screen.getByText('API Credentials'));
    expect(screen.getByDisplayValue('sk-123')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:11434')).toBeInTheDocument();
  });

  it('triggers saveSettings on form submission', async () => {
    render(<SettingsPanel />);
    
    const saveButton = screen.getByRole('button', { name: /Save Settings/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalled();
    });
  });

  it('triggers setTheme on theme swatch click', () => {
    render(<SettingsPanel />);
    
    // Switch to "Appearance Theme" tab
    fireEvent.click(screen.getByText('Appearance Theme'));

    // Find and click "Nord Dark" swatch
    const nordSwatch = screen.getByText('Nord Dark');
    fireEvent.click(nordSwatch);
    
    expect(mockSetTheme).toHaveBeenCalledWith('nord');
  });
});
