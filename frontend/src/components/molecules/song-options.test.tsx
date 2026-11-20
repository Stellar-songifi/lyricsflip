import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SongOptions, type SongOption } from "./song-options";

const options: SongOption[] = ["Option A", "Option B", "Option C", "Option D"].map(
  (title) => ({ title, artist: "" }),
);

function renderOptions(overrides: Partial<React.ComponentProps<typeof SongOptions>> = {}) {
  const onSelect = jest.fn();
  const props: React.ComponentProps<typeof SongOptions> = {
    options,
    selectedOption: null,
    correctOption: null,
    disabled: false,
    onSelect,
    ...overrides,
  };
  const utils = render(<SongOptions {...props} />);
  return { ...utils, onSelect };
}

describe("SongOptions", () => {
  it("renders a radio group with one radio per option", () => {
    renderOptions();
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(options.length);
  });

  it("selects an option on click", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderOptions();
    await user.click(screen.getByRole("radio", { name: /Option B/ }));
    expect(onSelect).toHaveBeenCalledWith(options[1], 1);
  });

  it("marks the selected option as checked", () => {
    renderOptions({ selectedOption: options[2] });
    expect(screen.getByRole("radio", { name: /Option C/ })).toHaveAttribute("aria-checked", "true");
  });

  it("does not fire onSelect when disabled", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderOptions({ disabled: true });
    const option = screen.getByRole("radio", { name: /Option A/ });
    expect(option).toHaveAttribute("aria-disabled", "true");
    await user.click(option);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
