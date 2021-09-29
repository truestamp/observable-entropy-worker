describe('handle', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  test('handle nothing', async () => {
    expect('foo').toEqual('foo')
  })
})
