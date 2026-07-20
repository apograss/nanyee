from dataclasses import dataclass


@dataclass(frozen=True)
class Cabin:
    dev_id: int
    name: str


DEFAULT_CABINS = [
    *[Cabin(29817269 + index, f"西侧学习舱{index + 1}") for index in range(9)],
    *[Cabin(29817278 + index, f"东侧学习舱{index + 1}") for index in range(9)],
]
