/**
 * اختبار مكوّن CheckPhoneStep.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckPhoneStep } from './CheckPhoneStep'
import { setSilver, setSettings } from '@/services/storage'
import { defaultSettings } from '@/services/mockSettings'

const noop = vi.fn()
const mockLookup = vi.fn().mockResolvedValue(null)

beforeEach(() => {
  vi.clearAllMocks()
  setSilver([])
  setSettings(defaultSettings)
})

describe('CheckPhoneStep', () => {
  it('يعرض نموذج إدخال الرقم', () => {
    render(
      <CheckPhoneStep
        onSubmit={noop}
        onLookup={mockLookup}
      />
    )
    expect(screen.getByPlaceholderText(/رقم الجوال/)).toBeDefined()
  })

  it('يعرض زر استعلام عند إدخال رقم صحيح', async () => {
    const user = userEvent.setup()
    render(
      <CheckPhoneStep
        onSubmit={noop}
        onLookup={mockLookup}
      />
    )
    const input = screen.getByPlaceholderText(/رقم الجوال/)
    await user.type(input, '0501234567')
    expect(screen.getByRole('button', { name: /استعلم عن عضويتك/ })).toBeDefined()
  })
})
