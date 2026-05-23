import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsPanel } from './SettingsPanel.js';

const mockSaveSettings = vi.fn().mockResolvedValue(true);
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
    }),
  };
});

describe('SettingsPanel Component', () => {
  it('renders initial form values from store settings', () => {
    render(<SettingsPanel />);
    
    // Check complexity dropdowns and labels
    expect(screen.getByText('Low Complexity')).toBeInTheDocument();
    expect(screen.getByText('Medium Complexity')).toBeInTheDocument();
    expect(screen.getByText('High Complexity')).toBeInTheDocument();
    
    // Check input model name values
    expect(screen.getByDisplayValue('qwen2.5-coder:7b')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sk-123')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:11434')).toBeInTheDocument();
  });

  it('triggers saveSettings on form submission', async () => {
    render(<SettingsPanel />);
    
    const saveButton = screen.getByRole('button', { name: /Save Configurations/i });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalled();
    });
  });

  it('triggers setTheme on theme dropdown change', () => {
    render(<SettingsPanel />);
    
    const selectTheme = screen.getByDisplayValue('Obsidian Dark (Indigo Accent)');
    fireEvent.change(selectTheme, { target: { value: 'nord' } });
    
    expect(mockSetTheme).toHaveBeenCalledWith('nord');
  });
});
