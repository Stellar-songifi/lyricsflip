import { AppLogger } from './app-logger.service';
import { runWithRequestContext } from './request-context';

describe('AppLogger', () => {
  let out: jest.SpyInstance;

  beforeEach(() => {
    out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => out.mockRestore());

  const lastEntry = () => JSON.parse(out.mock.calls[out.mock.calls.length - 1][0]);

  it('writes one JSON line with context and request id', () => {
    const logger = new AppLogger({ json: true });
    runWithRequestContext({ requestId: 'req-1' }, () => logger.log('hello', 'Test'));

    expect(out).toHaveBeenCalledTimes(1);
    expect(lastEntry()).toMatchObject({ level: 'info', context: 'Test', requestId: 'req-1', msg: 'hello' });
  });

  it('redacts secrets in structured fields', () => {
    const logger = new AppLogger({ json: true });
    logger.info('login', { email: 'a@b.c', password: 'hunter2' });

    expect(lastEntry()).toMatchObject({ email: 'a@b.c', password: '[REDACTED]' });
  });

  it('drops entries below the configured level', () => {
    const logger = new AppLogger({ json: true, level: 'info' });
    logger.debug('noise');
    expect(out).not.toHaveBeenCalled();
  });
});
