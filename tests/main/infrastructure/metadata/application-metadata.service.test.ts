import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApplicationMetadataService,
  isArtworkUrl
} from '@main/infrastructure/metadata/application-metadata.service'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vrcc-artwork-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0])
const response = (body: BodyInit, status = 200) => new Response(body, { status })
const seed = (packageName: string, name: string, imageSize = 128) =>
  writeFile(
    join(directory, `${packageName}.json`),
    JSON.stringify({
      name,
      imageDataUrl: `data:image/png;base64,${'A'.repeat(imageSize)}`,
      checkedAt: Date.now()
    }),
    'utf8'
  )

describe('application artwork metadata', () => {
  it('evicts the least recently used entry and reloads it from disk without network access', async () => {
    await Promise.all(['a', 'b', 'c'].map((id) => seed(`com.${id}`, id)))
    const request = vi.fn()
    const service = new ApplicationMetadataService(directory, request, { maxEntries: 2 })
    await service.get('com.a')
    await service.get('com.b')
    await service.get('com.a') // Touch A: B should be evicted next.
    await service.get('com.c')
    await seed('com.a', 'changed A')
    await seed('com.b', 'changed B')
    expect((await service.get('com.a')).name).toBe('a')
    expect((await service.get('com.b', true)).name).toBe('changed B')
    expect(request).not.toHaveBeenCalled()
  })

  it('bounds retained artwork bytes as well as the number of entries', async () => {
    await seed('com.a', 'a')
    await seed('com.b', 'b')
    const service = new ApplicationMetadataService(directory, vi.fn(), {
      maxBytes: 1200,
      maxEntries: 100
    })
    await service.get('com.a')
    await service.get('com.b') // Both entries together exceed the byte budget.
    await seed('com.a', 'updated')
    expect((await service.get('com.a')).name).toBe('updated')
  })

  it('returns artwork exceeding the memory budget without retaining it or deleting disk cache', async () => {
    await seed('com.a', 'a')
    const request = vi.fn()
    const service = new ApplicationMetadataService(directory, request, { maxBytes: 100 })
    expect((await service.get('com.a')).imageDataUrl).toBeTruthy()
    await seed('com.a', 'new')
    expect((await service.get('com.a')).name).toBe('new')
    expect(await readdir(directory)).toContain('com.a.json')
    expect(request).not.toHaveBeenCalled()
  })
  it('makes no network requests until explicitly requested', async () => {
    const request = vi.fn()
    await expect(
      new ApplicationMetadataService(directory, request).get('com.example')
    ).resolves.toEqual({ name: null, imageDataUrl: null })
    expect(request).not.toHaveBeenCalled()
  })
  it('caches display names and image bytes for use after restart without the internet', async () => {
    const request = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('.json')
        ? response(
            JSON.stringify({
              name: 'Example Game',
              landscape: 'https://scontent.oculuscdn.com/game.png'
            })
          )
        : url.includes('QuestLauncherImages')
          ? response('', 404)
          : response(png)
    )
    const result = await new ApplicationMetadataService(directory, request).get('com.example', true)
    expect(result).toEqual({
      name: 'Example Game',
      imageDataUrl: `data:image/png;base64,${png.toString('base64')}`
    })
    const offline = vi.fn().mockRejectedValue(new Error('Offline'))
    await expect(
      new ApplicationMetadataService(directory, offline).get('com.example')
    ).resolves.toEqual(result)
    expect(offline).not.toHaveBeenCalled()
    expect(await readdir(directory)).toEqual(['com.example.json'])
  })
  it('ignores untrusted metadata URLs and executable image formats', async () => {
    const request = vi.fn().mockImplementation(async (url: string) =>
      url.endsWith('.json')
        ? response(
            JSON.stringify({
              name: 'Example',
              landscape: 'http://127.0.0.1/private',
              icon: 'https://evil.example/icon.png'
            })
          )
        : response('<svg onload="alert(1)" />')
    )
    const result = await new ApplicationMetadataService(directory, request).get('com.example', true)
    expect(result.imageDataUrl).toBeNull()
    expect(
      request.mock.calls.every(([url]) => url.startsWith('https://raw.githubusercontent.com/'))
    ).toBe(true)
    expect(isArtworkUrl('https://raw.githubusercontent.com.evil.example/image')).toBe(false)
    expect(isArtworkUrl('https://user:pass@scontent.oculuscdn.com/image')).toBe(false)
  })
  it('does not follow a CDN redirect to a local or unrelated host', async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith('.json')
          ? response('{}')
          : new Response(null, { status: 302, headers: { location: 'http://localhost/secret' } })
      )
    expect(
      (await new ApplicationMetadataService(directory, request).get('com.example', true))
        .imageDataUrl
    ).toBeNull()
    expect(request.mock.calls.some(([url]) => url.includes('localhost'))).toBe(false)
  })
  it('deduplicates concurrent requests and backs off missing artwork', async () => {
    const request = vi.fn().mockImplementation(async () => response('', 404))
    const service = new ApplicationMetadataService(directory, request)
    await Promise.all([service.get('com.example', true), service.get('com.example', true)])
    const calls = request.mock.calls.length
    expect(calls).toBe(2)
    await service.get('com.example', true)
    expect(request).toHaveBeenCalledTimes(calls)
  })
  it('rejects oversized images and unsafe cache identifiers', async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith('.json')
          ? response('{}')
          : new Response(png, { headers: { 'content-length': '100000000' } })
      )
    const service = new ApplicationMetadataService(directory, request)
    expect((await service.get('com.example', true)).imageDataUrl).toBeNull()
    await expect(service.get('../secret', true)).rejects.toThrow('Invalid package')
  })
  it('still uses priority artwork if the metadata JSON is malformed', async () => {
    const request = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith('.json') ? response('not json') : response(png)
      )
    const value = await new ApplicationMetadataService(directory, request).get('com.example', true)
    expect(value.name).toBeNull()
    expect(value.imageDataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
