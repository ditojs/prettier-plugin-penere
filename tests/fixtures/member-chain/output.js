object1.test().bla().bla().bla();

object1
  .test()
  .bla()
  .bla()
  .bla();

object1
  .test()
  .bla()
  .bla()
  .bla()
  .veeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeryLongFunctionName();

file.stream
  .off("data", onData)
  .off("end", onEnd)
  .pipe(stream);

expect(format(integer, { locale: "de-DE", date: true, time: true }))
  .toBe("2. Januar 1970 um 11:17:36");

function test() {
  expect(
    deindent`
      some
        indented
          text`,
  ).toBe(
    `some
  indented
    text`,
  );
}

object
  ?.foo()
  .bar();

object.foo().bar();

const trimmed = (foo || bar).trim();

foo(
  a,
).bar();

expect(() => setValueAtDataPath(data, "object.array[0].added", add))
  .not.toThrow();

expect(() =>
  setDataPathEntries(data, {
    "object.array[0].added": add,
  }),
)
  .not.toThrow();
