import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Path, File, Directory, Json, TempDir } from './index.js'
import path from 'node:path'
import fs from 'node:fs/promises'

describe('Path', () => {
  it('should create a Path instance', () => {
    const p = Path.at('/foo/bar')
    expect(p).toBeInstanceOf(Path)
    expect(p.toString()).toBe(path.normalize('/foo/bar'))
  })

  it('should join paths', () => {
    const p = Path.at('/foo')
    expect(p.join('bar', 'baz.txt').toString()).toBe(path.normalize('/foo/bar/baz.txt'))
  })

  it('should return basename, name, and ext', () => {
    const p = Path.at('/foo/bar.txt')
    expect(p.basename()).toBe('bar.txt')
    expect(p.name()).toBe('bar')
    expect(p.ext()).toBe('.txt')
  })

  it('should return parent directory', () => {
    const p = Path.at('/foo/bar/baz.txt')
    const parent = p.parent()
    expect(parent).toBeInstanceOf(Directory)
    expect(parent.toString()).toBe(path.normalize('/foo/bar'))
  })

  it('should change extension and name', () => {
    const p = Path.at('/foo/bar.txt')
    expect(p.withExt('.md').toString()).toBe(path.normalize('/foo/bar.md'))
    expect(p.withName('baz.zip').toString()).toBe(path.normalize('/foo/baz.zip'))
  })

  it('should resolve a path', () => {
    const p = Path.at('foo/bar')
    expect(p.resolve().isAbsolute()).toBe(true)
  })

  it('should calculate relative path', () => {
    const p1 = Path.at('/a/b/c')
    const p2 = '/a/d'
    expect(p1.relativeTo(p2).toString()).toBe(path.normalize('../b/c'))
  })

  describe('casting with as()', () => {
    it('should cast Path to File', () => {
      const p = Path.at('/a/b/c.txt')
      const f = p.as(File)
      expect(f).toBeInstanceOf(File)
      expect(f.toString()).toBe(p.toString())
    })

    it('should cast Path to Directory', () => {
      const p = Path.at('/a/b/c')
      const d = p.as(Directory)
      expect(d).toBeInstanceOf(Directory)
      expect(d.toString()).toBe(p.toString())
    })

    it('should throw when casting Directory to File', () => {
      const d = Directory.at('/a/b/c')
      expect(() => d.as(File)).toThrow('Cannot cast a Directory to a File')
    })

    it('should throw when casting File to Directory', () => {
      const f = File.at('/a/b/c.txt')
      expect(() => f.as(Directory)).toThrow('Cannot cast a File to a Directory')
    })

    it('should cast to Json', () => {
        const p = Path.at('/a/b/c.json')
        const j = p.as(Json)
        expect(j).toBeInstanceOf(Json)
    })
  })
})

describe('File and Directory with TempDir', () => {
  let tempDir: TempDir

  beforeEach(async () => {
    tempDir = new TempDir()
    await tempDir.create()
  })

  afterEach(async () => {
    await tempDir.remove()
  })

  it('should create and check existence of a file', async () => {
    const file = tempDir.join('test.txt').as(File)
    expect(await file.exists()).toBe(false)
    await file.create()
    expect(await file.exists()).toBe(true)
    expect(await file.isFile()).toBe(true)
    expect(await file.isDirectory()).toBe(false)
  })

  it('should ensure a file exists', async () => {
    const file = tempDir.join('new/test.txt').as(File)
    expect(await file.exists()).toBe(false)
    await file.ensure()
    expect(await file.exists()).toBe(true)
    await file.ensure() // should not throw
    expect(await file.exists()).toBe(true)
  })

  it('should write and read a file', async () => {
    const file = tempDir.join('test.txt').as(File)
    const content = 'Hello World!'
    await file.write(content)
    expect(await file.read()).toBe(content)
  })

  it('should get file size', async () => {
    const file = tempDir.join('test.txt').as(File)
    const content = 'Hello World!'
    await file.write(content)
    expect(await file.size()).toBe(Buffer.from(content).length)
  })

  it('should remove a file', async () => {
    const file = tempDir.join('test.txt').as(File)
    await file.create()
    expect(await file.exists()).toBe(true)
    await file.remove()
    expect(await file.exists()).toBe(false)
  })

  it('should copy, move, and rename a file', async () => {
    const file = tempDir.join('original.txt').as(File)
    await file.write('data')

    // Copy
    const copyTarget = tempDir.join('copy.txt').toString()
    await file.copyTo(copyTarget)
    const copiedFile = File.at(copyTarget)
    expect(await copiedFile.exists()).toBe(true)
    expect(await copiedFile.read()).toBe('data')

    // Move
    const moveTarget = tempDir.join('moved.txt').toString()
    await copiedFile.moveTo(moveTarget)
    expect(await copiedFile.exists()).toBe(false)
    const movedFile = File.at(moveTarget)
    expect(await movedFile.exists()).toBe(true)

    // Rename
    const renameTarget = tempDir.join('renamed.txt').toString()
    await movedFile.renameTo(renameTarget)
    expect(await movedFile.exists()).toBe(false)
    expect(await File.at(renameTarget).exists()).toBe(true)
  })

  it('should create and check existence of a directory', async () => {
    const dir = tempDir.join('test-dir').as(Directory)
    expect(await dir.exists()).toBe(false)
    await dir.create()
    expect(await dir.exists()).toBe(true)
    expect(await dir.isDirectory()).toBe(true)
    expect(await dir.isFile()).toBe(false)
  })

  it('should ensure a directory exists', async () => {
    const dir = tempDir.join('new/deep/dir').as(Directory)
    expect(await dir.exists()).toBe(false)
    await dir.ensure()
    expect(await dir.exists()).toBe(true)
    await dir.ensure() // should not throw
    expect(await dir.exists()).toBe(true)
  })

  it('should list directory contents', async () => {
    const dir = tempDir.join('list-dir').as(Directory)
    await dir.create()
    await dir.join('file1.txt').as(File).create()
    await dir.join('file2.txt').as(File).create()
    await dir.join('sub-dir').as(Directory).create()

    const files = await dir.listFiles()
    expect(files).toHaveLength(2)
    expect(files.map(f => f.basename())).toContain('file1.txt')

    const dirs = await dir.listDirs()
    expect(dirs).toHaveLength(1)
    expect(dirs[0]?.basename()).toBe('sub-dir')

    const all = await dir.list()
    expect(all).toHaveLength(3)
  })

  it('should list directory contents recursively', async () => {
    const root = tempDir.join('deep-list').as(Directory)
    await root.create()
    await root.join('f1.txt').as(File).create()
    const sub = root.join('sub').as(Directory)
    await sub.create()
    await sub.join('f2.txt').as(File).create()
    const subsub = sub.join('subsub').as(Directory)
    await subsub.create()

    const files = await root.listFilesDeep()
    expect(files).toHaveLength(2)

    const dirs = await root.listDirsDeep()
    expect(dirs).toHaveLength(2)

    const all = await root.listDeep()
    expect(all).toHaveLength(4)
  })

  it('should empty a directory', async () => {
    const dir = tempDir.join('to-empty').as(Directory)
    await dir.create()
    await dir.join('file1.txt').as(File).create()
    await dir.join('sub-dir').as(Directory).create()
    expect((await dir.list()).length).toBe(2)

    await dir.empty()
    expect((await dir.list()).length).toBe(0)
  })

  it('should walk a directory tree', async () => {
    const root = tempDir.join('walk-dir').as(Directory)
    await root.create()
    await root.join('f1.txt').as(File).create()
    const sub = root.join('sub').as(Directory)
    await sub.create()
    await sub.join('f2.txt').as(File).create()

    const walked: string[] = []
    await root.walk(async (item) => {
      walked.push(item.basename())
    })

    expect(walked).toHaveLength(3)
    expect(walked).toContain('f1.txt')
    expect(walked).toContain('sub')
    expect(walked).toContain('f2.txt')
  })
})

describe('Json', () => {
  let tempDir: TempDir

  beforeEach(async () => {
    tempDir = new TempDir()
    await tempDir.create()
  })

  afterEach(async () => {
    await tempDir.remove()
  })

  it('should create a json file with {}', async () => {
    const jsonFile = tempDir.join('test.json').as(Json)
    await jsonFile.create()
    expect(await jsonFile.read()).toEqual({})
  })

  it('should write and read an object from a json file', async () => {
    const jsonFile = tempDir.join('test.json').as(Json)
    const data = { a: 1, b: 'hello' }
    await jsonFile.write(data)

    const readData = await jsonFile.read()
    expect(readData).toEqual(data)
  })
})

describe('TempDir', () => {
  it('should create and automatically clean up a temporary directory', async () => {
    let tempPath: string | undefined
    const tempDir = new TempDir()

    await tempDir.with(async (dir) => {
      tempPath = dir.toString()
      expect(await dir.exists()).toBe(true)
      const file = dir.join('file.txt').as(File)
      await file.create()
      expect(await file.exists()).toBe(true)
    })

    expect(tempPath).toBeDefined()
    // Use fs.access to check for non-existence, which throws an error
    await expect(fs.access(tempPath!)).rejects.toThrow()
  })
})