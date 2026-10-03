"""The HUD quickstart environment, used as a test fixture.

Its grader is deliberately weak (`str(n) in answer`), which the grader probes should catch.
"""

from hud import Environment

env = Environment(name="letter-count")


@env.template(description="Count how many times a letter appears in a word.")
async def count_letter(word: str = "strawberry", letter: str = "r"):
    answer = yield f"How many '{letter}'s are in '{word}'? Reply with just the number."
    yield 1.0 if answer and str(word.count(letter)) in answer else 0.0


tasks = [count_letter(word=w) for w in ("strawberry", "raspberry", "blueberry")]
